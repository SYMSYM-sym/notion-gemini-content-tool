import { NextRequest, NextResponse } from 'next/server';
import { loadApprovedManifest, saveApprovedEntry } from '@/lib/manifest';
import { ApprovedRecord } from '@/lib/types';

// Force dynamic — prevent Next.js from caching GET at build time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const data = await loadApprovedManifest();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to load approved manifest:', error);
    return NextResponse.json({}, { status: 200 });
  }
}

// PATCH: add/update a single entry — writes to its own blob file, no read-modify-write.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const key: string = body.key;
    const record: ApprovedRecord = body.record;
    if (!key || !record) {
      return NextResponse.json({ error: 'key and record are required' }, { status: 400 });
    }
    await saveApprovedEntry(key, record);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to patch';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
