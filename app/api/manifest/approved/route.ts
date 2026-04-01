import { NextRequest, NextResponse } from 'next/server';
import { loadApprovedManifest, saveApprovedManifest } from '@/lib/manifest';
import { ApprovedRecord } from '@/lib/types';

// Force dynamic — without this, Next.js caches the GET response at build time
// and always returns the stale empty {} result
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

// PATCH: add/update a single entry without risk of overwriting everything.
// The read-modify-write happens server-side; if the read fails, we don't write.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const key: string = body.key;
    const record: ApprovedRecord = body.record;
    if (!key || !record) {
      return NextResponse.json({ error: 'key and record are required' }, { status: 400 });
    }
    const manifest = await loadApprovedManifest();
    manifest[key] = record;
    await saveApprovedManifest(manifest);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to patch';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
