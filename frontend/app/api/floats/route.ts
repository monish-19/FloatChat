import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';
  try {
    const response = await fetch(`${backendUrl}/floats`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ float_ids: [], status: 'demo' }, { status: 200 });
  }
}
