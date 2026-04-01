import { NextRequest, NextResponse } from 'next/server';
import { loadSessionsManifest, saveSessionsManifest } from '@/lib/manifest';
import { Session } from '@/lib/sessions';

// Force dynamic — without this, Next.js caches the GET response at build time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_SESSIONS = 30;

export async function GET() {
  try {
    const sessions = await loadSessionsManifest();
    return NextResponse.json(sessions, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const session: Session = body.session;
    if (!session?.id) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
    }
    const all = await loadSessionsManifest();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      all[idx] = session;
    } else {
      all.unshift(session);
      if (all.length > MAX_SESSIONS) all.splice(MAX_SESSIONS);
    }
    await saveSessionsManifest(all);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const all = await loadSessionsManifest();
    const filtered = all.filter((s) => s.id !== id);
    await saveSessionsManifest(filtered);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
