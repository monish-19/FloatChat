import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';

  try {
    const res = await fetch(`${backendUrl}/health`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        status: 'demo',
        service: 'FloatChat backend',
        profiles: 0,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
