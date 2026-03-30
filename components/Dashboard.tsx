'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { NotionEntry } from '@/lib/types';
import { usePipeline } from '@/hooks/usePipeline';
import { saveSession, SessionEntryRecord } from '@/lib/sessions';
import NotionUrlInput from './NotionUrlInput';
import FilterBar from './FilterBar';
import PipelineControls from './PipelineControls';
import EntryTable from './EntryTable';
import PipelineLog from './PipelineLog';
import ReviewQueue from './ReviewQueue';
import PreviewModal from './PreviewModal';
import SessionsView from './SessionsView';

export default function Dashboard() {
  const [entries, setEntries] = useState<NotionEntry[]>([]);
  const [isLoadingNotion, setIsLoadingNotion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState('Instagram');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<NotionEntry | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const sessionCreatedAtRef = useRef<string>('');
  const sessionUrlRef = useRef<string>('');

  const pipeline = usePipeline();

  // Auto-save session to localStorage whenever statuses or results change
  useEffect(() => {
    if (!sessionIdRef.current || entries.length === 0) return;
    const sessionEntries: SessionEntryRecord[] = entries.map((entry) => {
      const status = pipeline.statuses.get(entry.id) || 'pending';
      const result = pipeline.results.get(entry.id);
      return {
        id: entry.id,
        day: entry.day,
        topic: entry.topic,
        contentType: entry.contentType,
        platform: entry.platform,
        status,
        blobUrl: result?.blobUrl,
        blobUrls: result?.blobUrls,
        isVideo: result?.isVideo,
        verificationScore: result?.verification?.score,
      };
    });
    saveSession({
      id: sessionIdRef.current,
      createdAt: sessionCreatedAtRef.current,
      notionUrl: sessionUrlRef.current,
      entries: sessionEntries,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, pipeline.statuses, pipeline.results]);

  const loadNotion = useCallback(async (url: string) => {
    setIsLoadingNotion(true);
    setError(null);
    // Create a new session record for this load
    sessionIdRef.current = `session_${Date.now()}`;
    sessionCreatedAtRef.current = new Date().toISOString();
    sessionUrlRef.current = url;
    // Reset all pipeline state so nothing carries over from a previous session
    pipeline.resetAll();
    try {
      // Cache-bust with timestamp to prevent browser and CDN caching
      const res = await fetch(
        `/api/notion?url=${encodeURIComponent(url)}&_t=${Date.now()}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const sorted = [...data.entries].sort((a: NotionEntry, b: NotionEntry) => (a.day ?? 999) - (b.day ?? 999));
      setEntries(sorted);
      // Restore any previously approved entries from localStorage
      pipeline.restoreApproved(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Notion data');
    } finally {
      setIsLoadingNotion(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (platform !== 'All' && e.platform.toLowerCase() !== platform.toLowerCase())
        return false;
      if (statusFilter !== 'all') {
        const s = pipeline.statuses.get(e.id) || 'pending';
        if (statusFilter === 'generating') {
          if (!['generating', 'verifying', 'retrying'].includes(s)) return false;
        } else if (s !== statusFilter) return false;
      }
      if (search && !e.topic.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, platform, statusFilter, search, pipeline.statuses]);

  const counts = useMemo(() => {
    let pending = 0, passed = 0, approved = 0, review = 0;
    for (const entry of entries) {
      const s = pipeline.statuses.get(entry.id) || 'pending';
      if (s === 'pending') pending++;
      else if (s === 'passed') passed++;
      else if (s === 'approved') approved++;
      else if (s === 'needs_review') review++;
    }
    return { pending, passed, approved, review };
  }, [entries, pipeline.statuses]);

  const reviewEntries = useMemo(
    () => entries.filter((e) => pipeline.statuses.get(e.id) === 'needs_review'),
    [entries, pipeline.statuses]
  );

  const handleStartPipeline = useCallback(() => {
    const pending = filteredEntries.filter(
      (e) => !pipeline.statuses.get(e.id) || pipeline.statuses.get(e.id) === 'pending'
    );
    pipeline.startPipeline(pending);
  }, [filteredEntries, pipeline]);

  const handleSingleGenerate = useCallback(
    async (entry: NotionEntry) => {
      await pipeline.processEntry(entry);
    },
    [pipeline]
  );

  const handleDownload = useCallback(async () => {
    const approvedUrls: string[] = [];
    pipeline.results.forEach((result) => {
      if (result.blobUrl) approvedUrls.push(result.blobUrl);
    });
    if (approvedUrls.length === 0) {
      alert('No approved images to download');
      return;
    }
    window.open(
      `/api/download?urls=${encodeURIComponent(JSON.stringify(approvedUrls))}`,
      '_blank'
    );
  }, [pipeline.results]);

  const currentEntry = entries.find((e) => e.id === pipeline.currentEntryId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Content Generator
            </h1>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {showHistory ? '← Generator' : 'History'}
            </button>
          </div>
          <div className="w-full sm:w-96">
            <NotionUrlInput
              onLoad={loadNotion}
              isLoading={isLoadingNotion}
              defaultUrl={process.env.NEXT_PUBLIC_DEFAULT_NOTION_URL}
            />
          </div>
        </div>

        {/* Session History view */}
        {showHistory && (
          <SessionsView onClose={() => setShowHistory(false)} />
        )}

        {error && !showHistory && (
          <div className="p-3 text-sm text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {entries.length > 0 && !showHistory && (
          <>
            {/* Pipeline Controls */}
            <PipelineControls
              isRunning={pipeline.isRunning}
              isPaused={pipeline.isPaused}
              processed={pipeline.processed}
              total={pipeline.total}
              pendingCount={counts.pending}
              passedCount={counts.passed}
              approvedCount={counts.approved}
              reviewCount={counts.review}
              onStart={handleStartPipeline}
              onPause={pipeline.pausePipeline}
              onStop={pipeline.stopPipeline}
              currentTopic={currentEntry?.topic}
            />

            {/* Filters */}
            <FilterBar
              platform={platform}
              onPlatformChange={setPlatform}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              search={search}
              onSearchChange={setSearch}
            />

            {/* Entry Table */}
            <EntryTable
              entries={filteredEntries}
              statuses={pipeline.statuses}
              results={pipeline.results}
              currentEntryId={pipeline.currentEntryId}
              onGenerate={handleSingleGenerate}
              onApprove={(entry) => pipeline.manualApprove(entry.id, entry)}
              onRowClick={setSelectedEntry}
            />

            {/* Pipeline Log */}
            <PipelineLog log={pipeline.log} />

            {/* Bottom Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                disabled={counts.approved === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-sage-600 rounded-lg hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Download All Approved ({counts.approved})
              </button>
              <button
                onClick={() => setShowReview(!showReview)}
                className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 transition-colors"
              >
                Review ({counts.review})
              </button>
            </div>

            {/* Review Queue */}
            {showReview && (
              <ReviewQueue
                entries={reviewEntries}
                results={pipeline.results}
                onApprove={(id) => {
                  const e = entries.find((x) => x.id === id);
                  pipeline.manualApprove(id, e);
                }}
                onReject={(id) => pipeline.rejectEntry(id)}
                onRegenerate={(entry) => {
                  pipeline.resetEntry(entry.id);
                  handleSingleGenerate(entry);
                }}
              />
            )}
          </>
        )}

        {/* Preview Modal */}
        {selectedEntry && (
          <PreviewModal
            entry={selectedEntry}
            result={pipeline.results.get(selectedEntry.id)}
            onClose={() => setSelectedEntry(null)}
            onApprove={() => {
              pipeline.manualApprove(selectedEntry.id, selectedEntry);
              setSelectedEntry(null);
            }}
            onReject={() => {
              pipeline.rejectEntry(selectedEntry.id);
              setSelectedEntry(null);
            }}
            onRegenerate={() => {
              pipeline.resetEntry(selectedEntry.id);
              handleSingleGenerate(selectedEntry);
              setSelectedEntry(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
