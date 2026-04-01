import { put, list } from '@vercel/blob';
import { ApprovedRecord } from './types';
import { Session } from './sessions';

const APPROVED_PATH = '_meta/approved.json';
const SESSIONS_PATH = '_meta/sessions.json';

/**
 * Read a JSON blob from Vercel Blob storage.
 *
 * IMPORTANT: This function throws on read errors instead of returning a fallback.
 * This prevents the data-destroying pattern where:
 *   1. Read fails → returns empty fallback
 *   2. Caller merges one entry into the empty fallback
 *   3. Write overwrites all existing data with just that one entry
 *
 * Returns the fallback ONLY when the blob genuinely does not exist yet.
 */
async function readBlob<T>(pathname: string, fallback: T): Promise<T> {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  // Blob doesn't exist yet — safe to return fallback (it's a fresh start)
  if (blobs.length === 0) return fallback;
  if (blobs[0].pathname !== pathname) return fallback;
  // Blob exists — if read fails, we MUST throw to prevent callers
  // from overwriting existing data with an empty fallback
  const res = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Blob read failed (${res.status}) for ${pathname}`);
  }
  return await res.json() as T;
}

async function writeBlob(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

export async function loadApprovedManifest(): Promise<Record<string, ApprovedRecord>> {
  return readBlob<Record<string, ApprovedRecord>>(APPROVED_PATH, {});
}

export async function saveApprovedManifest(data: Record<string, ApprovedRecord>): Promise<void> {
  await writeBlob(APPROVED_PATH, data);
}

export async function loadSessionsManifest(): Promise<Session[]> {
  return readBlob<Session[]>(SESSIONS_PATH, []);
}

export async function saveSessionsManifest(sessions: Session[]): Promise<void> {
  await writeBlob(SESSIONS_PATH, sessions);
}
