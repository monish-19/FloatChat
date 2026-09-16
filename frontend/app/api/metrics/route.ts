import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';
  try {
    const response = await fetch(`${backendUrl}/metrics`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({
      status: 'offline',
      sample_count: 0,
      percentiles: {},
      recent_runs: [],
    }, { status: 200 });
  }
}
