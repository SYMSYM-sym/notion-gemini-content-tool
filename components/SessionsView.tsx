'use client';

import { useState, useEffect } from 'react';
import { Session, SessionEntryRecord, loadSessions, deleteSession } from '@/lib/sessions';
import StatusBadge from './StatusBadge';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname;
    return path.length > 45 ? '...' + path.slice(-45) : path || u.hostname;
  } catch {
    return url.slice(0, 50);
  }
}

function getSummary(entries: SessionEntryRecord[]) {
  return {
    total: entries.length,
    approved: entries.filter((e) => e.status === 'approved').length,
    failed: entries.filter((e) => e.status === 'failed').length,
    needs_review: entries.filter((e) => e.status === 'needs_review').length,
    pending: entries.filter((e) => e.status === 'pending').length,
  };
}

export default function SessionsView({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions().then((s) => {
      setSessions(s);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Session History</h2>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          ← Back to Generator
        </button>
      </div>

      {loading && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p className="text-sm">Loading sessions...</p>
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p className="text-lg font-medium">No sessions recorded yet</p>
          <p className="text-sm mt-1">
            Load a Notion URL and run the pipeline — each session is saved automatically.
          </p>
        </div>
      )}

      {sessions.map((session) => {
        const summary = getSummary(session.entries);
        const isExpanded = expandedId === session.id;
        const approvedWithMedia = session.entries.filter(
          (e) => e.status === 'approved' && (e.blobUrl || (e.blobUrls && e.blobUrls.length > 0))
        );

        return (
          <div
            key={session.id}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            {/* Session card header */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : session.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDate(session.createdAt)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {shortUrl(session.notionUrl)}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {summary.approved > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium">
                    {summary.approved} approved
                  </span>
                )}
                {summary.failed > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium">
                    {summary.failed} failed
                  </span>
                )}
                {summary.needs_review > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 font-medium">
                    {summary.needs_review} needs review
                  </span>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {summary.total} total
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(session.id);
                  }}
                  className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors text-lg leading-none ml-1"
                  title="Delete session"
                >
                  ×
                </button>
                <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                {/* Approved media thumbnail grid */}
                {approvedWithMedia.length > 0 && (
                  <div className="p-4 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
                    {approvedWithMedia.flatMap((e) => {
                      const urls =
                        e.blobUrls && e.blobUrls.length > 0
                          ? e.blobUrls
                          : e.blobUrl
                          ? [e.blobUrl]
                          : [];
                      return urls.map((url, i) => (
                        <a
                          key={`${e.id}-${i}`}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Day ${e.day ?? '?'} — ${e.topic}${urls.length > 1 ? ` (Slide ${i + 1})` : ''}`}
                          className="block w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-green-500 transition-all flex-shrink-0"
                        >
                          {e.isVideo ? (
                            <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl">
                              ▶
                            </div>
                          ) : (
                            <img
                              src={url}
                              alt={e.topic}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          )}
                        </a>
                      ));
                    })}
                  </div>
                )}

                {/* Entry list */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-72 overflow-y-auto">
                  {session.entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 w-8 flex-shrink-0 text-xs font-mono">
                        {e.day != null ? `D${e.day}` : '—'}
                      </span>
                      <span className="flex-1 min-w-0 font-medium text-gray-900 dark:text-white truncate">
                        {e.topic}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 text-xs hidden sm:block flex-shrink-0">
                        {e.contentType}
                      </span>
                      {e.verificationScore !== undefined && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {e.verificationScore}/10
                        </span>
                      )}
                      <div className="flex-shrink-0">
                        <StatusBadge status={e.status} />
                      </div>
                      {(e.blobUrl || (e.blobUrls && e.blobUrls[0])) && (
                        <a
                          href={(e.blobUrls && e.blobUrls[0]) || e.blobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                        >
                          View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
