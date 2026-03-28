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

const STORAGE_KEY = 'cg_sessions';
const MAX_SESSIONS = 30;

function read(): Session[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

function write(sessions: Session[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage full — trim aggressively and retry
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 10)));
    } catch {}
  }
}

export function loadSessions(): Session[] {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveSession(session: Session): void {
  const all = read();
  const idx = all.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    all[idx] = session;
  } else {
    all.unshift(session);
    if (all.length > MAX_SESSIONS) all.splice(MAX_SESSIONS);
  }
  write(all);
}

export function deleteSession(id: string): void {
  write(read().filter((s) => s.id !== id));
}
