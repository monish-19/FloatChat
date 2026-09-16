import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';
  const query = new URL(request.url).search;
  try {
    const response = await fetch(`${backendUrl}/transect${query}`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ variable: 'temperature', distance_km: [], depths: [], grid: [], status: 'demo' }, { status: 200 });
  }
}
