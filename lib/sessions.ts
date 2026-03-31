import { EntryStatus } from './types';

export interface SessionEntryRecord {
  id: string;
  day: number | null;
  topic: string;
  contentType: string;
  platform: string;
  status: EntryStatus;
  blobUrl?: string;
  blobUrls?: string[];
  isVideo?: boolean;
  verificationScore?: number;
}

export interface Session {
  id: string;
  createdAt: string; // ISO timestamp
  notionUrl: string;
  entries: SessionEntryRecord[];
}

export async function loadSessions(): Promise<Session[]> {
  try {
    const res = await fetch('/api/manifest/sessions', { cache: 'no-store' });
    if (!res.ok) return [];
    const sessions: Session[] = await res.json();
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await fetch(`/api/manifest/sessions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {}
}
