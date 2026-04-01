import { put, list } from '@vercel/blob';
import { ApprovedRecord } from './types';
import { Session } from './sessions';

const APPROVED_PATH = '_meta/approved.json';
const SESSIONS_PATH = '_meta/sessions.json';

async function readBlob<T>(pathname: string, fallback: T): Promise<T> {
  try {
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    if (blobs.length === 0) return fallback;
    // Ensure exact pathname match — list uses prefix matching
    if (blobs[0].pathname !== pathname) return fallback;
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch {
    return fallback;
  }
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
