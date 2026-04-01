import { put, list, del } from '@vercel/blob';
import { ApprovedRecord } from './types';
import { Session } from './sessions';

// Each approved entry is its own blob file → no read-modify-write on a global manifest.
// Each session is its own blob file → same benefit.
// This eliminates CDN stale-read issues that destroyed data when using a single JSON file.
const APPROVED_PREFIX = '_meta/a/';
const SESSIONS_PREFIX = '_meta/s/';

// Legacy single-file paths (read-only, for migration)
const LEGACY_APPROVED = '_meta/approved.json';
const LEGACY_SESSIONS = '_meta/sessions.json';

/** Sanitize a stableKey for use as a blob pathname */
function blobSafe(key: string): string {
  return key.replace(/[^a-z0-9_-]/gi, '_');
}

// --------------- Approved Entries ---------------

/** Save a single approved entry to its own blob file. No read needed. */
export async function saveApprovedEntry(key: string, record: ApprovedRecord): Promise<void> {
  await put(`${APPROVED_PREFIX}${blobSafe(key)}.json`, JSON.stringify(record), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

/** Read a single approved entry (for carousel appending). Cache-busted. */
export async function readApprovedEntry(key: string): Promise<ApprovedRecord | null> {
  try {
    const pathname = `${APPROVED_PREFIX}${blobSafe(key)}.json`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    if (blobs.length === 0 || blobs[0].pathname !== pathname) return null;
    // Cache-bust: add timestamp to bypass Vercel CDN stale cache
    const res = await fetch(blobs[0].url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as ApprovedRecord;
  } catch {
    return null;
  }
}

/** Load all approved entries from individual blob files + legacy single file. */
export async function loadApprovedManifest(): Promise<Record<string, ApprovedRecord>> {
  const result: Record<string, ApprovedRecord> = {};

  // 1. Read legacy single-file manifest (migration path)
  try {
    const { blobs } = await list({ prefix: LEGACY_APPROVED, limit: 1 });
    if (blobs.length > 0 && blobs[0].pathname === LEGACY_APPROVED) {
      const res = await fetch(blobs[0].url + '?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const legacy = await res.json() as Record<string, ApprovedRecord>;
        Object.assign(result, legacy);
      }
    }
  } catch { /* legacy file missing or corrupt — skip */ }

  // 2. Read individual entry files (new approach — these take precedence)
  try {
    const { blobs } = await list({ prefix: APPROVED_PREFIX, limit: 1000 });
    if (blobs.length > 0) {
      const entries = await Promise.all(
        blobs.map(async (blob) => {
          try {
            const res = await fetch(blob.url + '?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return null;
            const record = await res.json() as ApprovedRecord;
            // Extract key from pathname: _meta/a/{sanitizedKey}.json
            const safeName = blob.pathname.slice(APPROVED_PREFIX.length).replace(/\.json$/, '');
            return { key: safeName, record };
          } catch { return null; }
        })
      );
      for (const entry of entries) {
        if (entry) result[entry.key] = entry.record;
      }
    }
  } catch { /* list failed — we still have legacy data if any */ }

  return result;
}

/** Bulk write — saves each entry as its own blob. Used only for full-manifest PUT. */
export async function saveApprovedManifest(data: Record<string, ApprovedRecord>): Promise<void> {
  await Promise.all(
    Object.entries(data).map(([key, record]) => saveApprovedEntry(key, record))
  );
}

// --------------- Sessions ---------------

/** Save a single session to its own blob file. No read needed. */
export async function saveSessionBlob(session: Session): Promise<void> {
  await put(`${SESSIONS_PREFIX}${session.id}.json`, JSON.stringify(session), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

/** Load all sessions from individual blob files + legacy single file. */
export async function loadSessionsManifest(): Promise<Session[]> {
  const sessionsById = new Map<string, Session>();

  // 1. Read legacy single-file manifest (migration path)
  try {
    const { blobs } = await list({ prefix: LEGACY_SESSIONS, limit: 1 });
    if (blobs.length > 0 && blobs[0].pathname === LEGACY_SESSIONS) {
      const res = await fetch(blobs[0].url + '?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const legacy = await res.json() as Session[];
        for (const s of legacy) sessionsById.set(s.id, s);
      }
    }
  } catch { /* legacy file missing or corrupt — skip */ }

  // 2. Read individual session files (new approach — these take precedence)
  try {
    const { blobs } = await list({ prefix: SESSIONS_PREFIX, limit: 1000 });
    if (blobs.length > 0) {
      const sessions = await Promise.all(
        blobs.map(async (blob) => {
          try {
            const res = await fetch(blob.url + '?t=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.json() as Session;
          } catch { return null; }
        })
      );
      for (const s of sessions) {
        if (s) sessionsById.set(s.id, s);
      }
    }
  } catch { /* list failed — we still have legacy data if any */ }

  return Array.from(sessionsById.values());
}

/** Delete a single session blob. */
export async function deleteSessionBlob(id: string): Promise<void> {
  const pathname = `${SESSIONS_PREFIX}${id}.json`;
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  if (blobs.length > 0 && blobs[0].pathname === pathname) {
    await del(blobs[0].url);
  }
}

// Legacy compat — saveSessionsManifest writes each session individually
export async function saveSessionsManifest(sessions: Session[]): Promise<void> {
  await Promise.all(sessions.map(s => saveSessionBlob(s)));
}
