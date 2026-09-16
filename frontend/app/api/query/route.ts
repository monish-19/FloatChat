import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';

  try {
    const res = await fetch(`${backendUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        answer: 'The live backend is not running. Use the demo profile in the UI or start the FastAPI service on port 8000.',
        match_count: 0,
        summary: { variable: 'temperature', region: 'global', depth_mode: 'mixed' },
        latency: {
          embedding_ms: 0,
          retrieval_ms: 0,
          sql_ms: 0,
          llm_ms: 0,
          total_ms: 0,
        },
      },
      { status: 200 },
    );
  }
}
