import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';

  try {
    const res = await fetch(`${backendUrl}/anomalies`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ events: [], count: 0, status: 'demo' }, { status: 200 });
  }
}
