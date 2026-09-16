import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const backendUrl = process.env.FLOATCHAT_BACKEND_URL || 'http://localhost:8000';
  const floatId = params.id;
  try {
    const response = await fetch(`${backendUrl}/floats/${encodeURIComponent(floatId)}/trajectory`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ float_id: floatId, path: [], status: 'demo' }, { status: 200 });
  }
}
