import { NextRequest, NextResponse } from 'next/server';
import { loadSessionsManifest, saveSessionBlob, deleteSessionBlob } from '@/lib/manifest';
import { Session } from '@/lib/sessions';

// Force dynamic — prevent Next.js from caching GET at build time
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const sessions = await loadSessionsManifest();
    return NextResponse.json(sessions, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to load sessions:', error);
    return NextResponse.json([], { status: 200 });
  }
}

// Shared upsert logic — just writes the session to its own blob file.
// No read-modify-write, no global manifest to corrupt.
async function upsertSession(request: NextRequest) {
  const body = await request.json();
  const session: Session = body.session;
  if (!session?.id) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  }
  await saveSessionBlob(session);
  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  try {
    return await upsertSession(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save';
    console.error('Session PUT failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST handler — used by navigator.sendBeacon for reliable saves on tab close
export async function POST(request: NextRequest) {
  try {
    return await upsertSession(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save';
    console.error('Session POST failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    await deleteSessionBlob(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    console.error('Session DELETE failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
