import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';

  try {
    const res = await fetch(`${backendUrl}/ingest`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        status: 'demo',
        profiles_ingested: 1234,
        last_hour: 1234,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
