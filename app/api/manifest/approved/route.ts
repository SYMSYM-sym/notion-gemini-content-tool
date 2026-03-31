import { NextRequest, NextResponse } from 'next/server';
import { loadApprovedManifest, saveApprovedManifest } from '@/lib/manifest';
import { ApprovedRecord } from '@/lib/types';

export async function GET() {
  try {
    const data = await loadApprovedManifest();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({}, { status: 200 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const data: Record<string, ApprovedRecord> = body.data;
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    await saveApprovedManifest(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
