'use client';

import { useState, useCallback, useRef } from 'react';
import { NotionEntry, EntryStatus, VerificationResult, PipelineResult, LogEntry, ApprovedRecord } from '@/lib/types';

/** Stable key for an entry that survives ID changes between Notion reloads */
export function stableKey(entry: { day?: number | null; contentType?: string; topic?: string }): string {
  return `d${entry.day ?? 'X'}_${(entry.contentType || '').toLowerCase().replace(/\s+/g, '')}_${(entry.topic || '').toLowerCase().replace(/\s+/g, '')}`;
}

interface PipelineState {
  entries: NotionEntry[];
  statuses: Map<string, EntryStatus>;
  results: Map<string, PipelineResult>;
  log: LogEntry[];
  isRunning: boolean;
  isPaused: boolean;
  currentEntryId: string | null;
  processed: number;
  total: number;
}

export function usePipeline() {
  const [statuses, setStatuses] = useState<Map<string, EntryStatus>>(new Map());
  const [results, setResults] = useState<Map<string, PipelineResult>>(new Map());
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);

  const pauseRef = useRef(false);
  const runningRef = useRef(false);

  const updateStatus = useCallback((entryId: string, status: EntryStatus) => {
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(entryId, status);
      return next;
    });
  }, []);

  const updateResult = useCallback((entryId: string, result: PipelineResult) => {
    setResults((prev) => {
      const next = new Map(prev);
      next.set(entryId, result);
      return next;
    });
  }, []);

  const addLog = useCallback(
    (message: string, type: LogEntry['type'] = 'info', entryId?: string) => {
      setLog((prev) => [
        ...prev,
        { timestamp: new Date(), message, type, entryId },
      ]);
    },
    []
  );

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const isVideoEntry = (entry: NotionEntry): boolean => {
    const ct = entry.contentType.toLowerCase();
    return ct.includes('video') || ct.includes('reel');
  };

  const processVideoEntry = async (entry: NotionEntry): Promise<PipelineResult> => {
    updateStatus(entry.id, 'generating');
    addLog(
      `Day ${entry.day} - ${entry.topic}: Generating video with audio (fal.ai LTX v2.3 — may take up to 3 minutes)...`,
      'info',
      entry.id
    );

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Video generation failed');
      }
      const data = await res.json();

      updateStatus(entry.id, 'passed');
      addLog(
        `Day ${entry.day} - ${entry.topic}: Video generated — awaiting your approval`,
        'success',
        entry.id
      );

      const result: PipelineResult = {
        entryId: entry.id,
        status: 'passed',
        videoUrl: data.videoUrl,
        isVideo: true,
        prompt: data.prompt,
        attempts: 1,
      };
      updateResult(entry.id, result);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Video generation failed';
      addLog(`Day ${entry.day} - ${entry.topic}: Video error - ${msg}`, 'error', entry.id);
      updateStatus(entry.id, 'failed');
      const result: PipelineResult = {
        entryId: entry.id,
        status: 'failed',
        isVideo: true,
        attempts: 1,
      };
      updateResult(entry.id, result);
      return result;
    }
  };

  const processEntry = useCallback(
    async (entry: NotionEntry): Promise<PipelineResult> => {
      // Route video entries to video generation
      if (isVideoEntry(entry)) {
        return processVideoEntry(entry);
      }

      let attempts = 0;
      let lastFeedback: VerificationResult | null = null;
      let lastImages: string[] | undefined;

      while (attempts < 3) {
        attempts++;

        // Step 1: Generate (may produce multiple slides for carousels)
        updateStatus(entry.id, 'generating');
        addLog(
          `Day ${entry.day} - ${entry.topic}: Generating image(s) (attempt ${attempts}/3)...`,
          'info',
          entry.id
        );

        let images: string[];
        let prompt: string;
        try {
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entry,
              previousFeedback: lastFeedback,
            }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Generation failed');
          }
          const data = await res.json();
          images = data.images || [data.imageBase64];
          prompt = data.prompt;
          lastImages = images;
          if (images.length > 1) {
            addLog(
              `Day ${entry.day} - ${entry.topic}: Generated ${images.length} slides`,
              'info',
              entry.id
            );
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Generation failed';
          addLog(`Day ${entry.day} - ${entry.topic}: Error - ${msg}`, 'error', entry.id);

          if (attempts === 1) {
            addLog(`Day ${entry.day} - ${entry.topic}: Retrying generation...`, 'warning', entry.id);
            continue;
          }

          updateStatus(entry.id, 'failed');
          const result: PipelineResult = {
            entryId: entry.id,
            status: 'failed',
            imageBase64: lastImages?.[0],
            images: lastImages,
            attempts,
          };
          updateResult(entry.id, result);
          return result;
        }

        // Step 2: Verify (check the first/cover image)
        updateStatus(entry.id, 'verifying');
        addLog(
          `Day ${entry.day} - ${entry.topic}: Verifying image...`,
          'info',
          entry.id
        );

        let verification: VerificationResult;
        try {
          const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: images[0], entry }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Verification failed');
          }
          verification = await res.json();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Verification error';
          addLog(
            `Day ${entry.day} - ${entry.topic}: Verification error (${msg}), auto-approving`,
            'warning',
            entry.id
          );
          verification = {
            score: 7,
            matches: true,
            feedback: `Verification unavailable: ${msg}`,
            missingElements: [],
            unwantedElements: [],
          };
        }

        addLog(
          `Day ${entry.day} - ${entry.topic}: Score ${verification.score}/10`,
          verification.score >= 7 ? 'success' : 'warning',
          entry.id
        );

        // Step 3: Decide
        if (verification.score >= 7) {
          // Mark as passed — awaits manual user approval before uploading to blob
          updateStatus(entry.id, 'passed');

          addLog(
            `Day ${entry.day} - ${entry.topic}: Passed verification (${verification.score}/10)${images.length > 1 ? ` — ${images.length} slides` : ''} — awaiting your approval`,
            'success',
            entry.id
          );
          const result: PipelineResult = {
            entryId: entry.id,
            status: 'passed',
            imageBase64: images[0],
            images,
            prompt,
            verification,
            attempts,
          };
          updateResult(entry.id, result);
          return result;
        }

        // Score too low
        addLog(
          `Day ${entry.day} - ${entry.topic}: Score too low. ${verification.feedback}`,
          'warning',
          entry.id
        );
        lastFeedback = verification;

        if (attempts < 3) {
          updateStatus(entry.id, 'retrying');
          addLog(
            `Day ${entry.day} - ${entry.topic}: Retrying with feedback (${attempts}/3)...`,
            'warning',
            entry.id
          );
        }
      }

      // Failed after 3 attempts
      updateStatus(entry.id, 'needs_review');
      addLog(
        `Day ${entry.day} - ${entry.topic}: Flagged for manual review after 3 attempts`,
        'error',
        entry.id
      );
      const result: PipelineResult = {
        entryId: entry.id,
        status: 'needs_review',
        imageBase64: lastImages?.[0],
        images: lastImages,
        verification: lastFeedback || undefined,
        attempts,
      };
      updateResult(entry.id, result);
      return result;
    },
    [updateStatus, updateResult, addLog]
  );

  const startPipeline = useCallback(
    async (entries: NotionEntry[]) => {
      const pendingEntries = entries.filter(
        (e) => !statuses.get(e.id) || statuses.get(e.id) === 'pending'
      );

      if (pendingEntries.length === 0) {
        addLog('No pending entries to process.', 'info');
        return;
      }

      setIsRunning(true);
      setIsPaused(false);
      runningRef.current = true;
      pauseRef.current = false;
      setTotal(pendingEntries.length);
      setProcessed(0);

      addLog(`Starting pipeline for ${pendingEntries.length} entries...`, 'info');

      for (let i = 0; i < pendingEntries.length; i++) {
        if (!runningRef.current) break;
        if (pauseRef.current) {
          addLog('Pipeline paused.', 'warning');
          break;
        }

        const entry = pendingEntries[i];
        setCurrentEntryId(entry.id);
        setProcessed(i);

        await processEntry(entry);
        setProcessed(i + 1);

        // Rate limit cooldown — longer for videos
        if (i < pendingEntries.length - 1 && runningRef.current && !pauseRef.current) {
          const isVideo = entry.contentType.toLowerCase().includes('video') || entry.contentType.toLowerCase().includes('reel');
          const cooldown = isVideo ? 15000 : 2000;
          addLog(`Cooling down (${cooldown / 1000}s)${isVideo ? ' — video rate limit' : ''}...`, 'info');
          await delay(cooldown);
        }
      }

      setCurrentEntryId(null);
      setIsRunning(false);
      runningRef.current = false;

      if (!pauseRef.current) {
        addLog('Pipeline complete!', 'success');
      }
    },
    [statuses, processEntry, addLog]
  );

  const pausePipeline = useCallback(() => {
    pauseRef.current = true;
    setIsPaused(true);
    addLog('Pausing pipeline after current entry...', 'warning');
  }, [addLog]);

  const stopPipeline = useCallback(() => {
    runningRef.current = false;
    pauseRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentEntryId(null);
    addLog('Pipeline stopped.', 'warning');
  }, [addLog]);

  const resetEntry = useCallback((entryId: string) => {
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(entryId, 'pending');
      return next;
    });
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(entryId);
      return next;
    });
  }, []);

  const manualApprove = useCallback(
    async (entryId: string, entry?: NotionEntry) => {
      const result = results.get(entryId);
      if (!result?.imageBase64 && !result?.images?.length && !result?.videoUrl) return;

      updateStatus(entryId, 'approved');
      addLog(`Approved: Day ${entry?.day || '?'} - ${entry?.topic || entryId}`, 'success', entryId);

      const entryData = entry || { id: entryId, day: null, topic: entryId } as NotionEntry;
      const entryKey = entry ? stableKey(entry) : undefined;
      const blobUrls: string[] = [];

      // Handle video upload — prefer videoUrl (CDN) over base64
      if (result.isVideo && (result.videoUrl || result.imageBase64)) {
        try {
          const res = await fetch('/api/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(result.videoUrl ? { videoUrl: result.videoUrl } : { videoBase64: result.imageBase64 }),
              entry: entryData,
              stableKey: entryKey,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            blobUrls.push(data.url);
          } else {
            addLog(`Day ${entry?.day || '?'} - ${entry?.topic || entryId}: Blob upload failed (${res.status}), using CDN URL`, 'warning', entryId);
          }
        } catch {
          addLog(`Day ${entry?.day || '?'} - ${entry?.topic || entryId}: Blob upload error, using CDN URL`, 'warning', entryId);
        }

        const finalUrl = blobUrls[0] || result.videoUrl;
        const finalUrls = blobUrls.length > 0 ? blobUrls : (result.videoUrl ? [result.videoUrl] : []);

        updateResult(entryId, {
          ...result,
          status: 'approved',
          blobUrl: finalUrl,
          blobUrls: finalUrls.length > 0 ? finalUrls : undefined,
        });

        // If blob upload failed but we have a CDN URL, persist to manifest directly
        if (blobUrls.length === 0 && finalUrl && entryKey) {
          fetch('/api/manifest/approved').then(r => r.json()).then((manifest: Record<string, ApprovedRecord>) => {
            manifest[entryKey] = { blobUrl: finalUrl, blobUrls: finalUrls, isVideo: true };
            fetch('/api/manifest/approved', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: manifest }),
            }).catch(() => {});
          }).catch(() => {});
        }
        return;
      }

      // Upload all images to blob (stableKey passed — server persists to manifest)
      const allImages = result.images || (result.imageBase64 ? [result.imageBase64] : []);

      for (let i = 0; i < allImages.length; i++) {
        try {
          const res = await fetch('/api/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: allImages[i],
              entry: entryData,
              slideIndex: allImages.length > 1 ? i : undefined,
              stableKey: entryKey,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            blobUrls.push(data.url);
          } else {
            addLog(`Day ${entry?.day || '?'} - Slide ${i + 1} blob upload failed (${res.status})`, 'warning', entryId);
          }
        } catch {
          addLog(`Day ${entry?.day || '?'} - Slide ${i + 1} blob upload error`, 'warning', entryId);
        }
      }

      updateResult(entryId, {
        ...result,
        status: 'approved',
        blobUrl: blobUrls[0],
        blobUrls: blobUrls.length > 0 ? blobUrls : undefined,
      });
    },
    [results, updateStatus, updateResult, addLog]
  );

  const rejectEntry = useCallback(
    (entryId: string) => {
      updateStatus(entryId, 'rejected');
      addLog(`Rejected entry ${entryId}`, 'warning', entryId);
    },
    [updateStatus, addLog]
  );

  /**
   * Reset pipeline AND restore previously approved entries in a single batch.
   * approvedData comes from the server-side manifest (Vercel Blob), not localStorage.
   */
  const resetAndRestore = useCallback((entries: NotionEntry[], approvedData: Record<string, ApprovedRecord>) => {
    runningRef.current = false;
    pauseRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentEntryId(null);
    setProcessed(0);
    setTotal(0);

    const newStatuses = new Map<string, EntryStatus>();
    const newResults = new Map<string, PipelineResult>();
    let restoredCount = 0;

    for (const entry of entries) {
      const key = stableKey(entry);
      const record = approvedData[key];
      if (record) {
        newStatuses.set(entry.id, 'approved');
        newResults.set(entry.id, {
          entryId: entry.id,
          status: 'approved',
          blobUrl: record.blobUrl,
          blobUrls: record.blobUrls,
          isVideo: record.isVideo,
          attempts: 1,
        });
        restoredCount++;
      }
    }

    setStatuses(newStatuses);
    setResults(newResults);

    if (restoredCount > 0) {
      setLog([{
        timestamp: new Date(),
        message: `Restored ${restoredCount} previously approved entries`,
        type: 'success' as const,
      }]);
    } else {
      setLog([]);
    }
  }, []);

  /** Clear all pipeline state — call when no restore is needed */
  const resetAll = useCallback(() => {
    runningRef.current = false;
    pauseRef.current = false;
    setStatuses(new Map());
    setResults(new Map());
    setLog([]);
    setIsRunning(false);
    setIsPaused(false);
    setCurrentEntryId(null);
    setProcessed(0);
    setTotal(0);
  }, []);

  return {
    statuses,
    results,
    log,
    isRunning,
    isPaused,
    currentEntryId,
    processed,
    total,
    startPipeline,
    pausePipeline,
    stopPipeline,
    processEntry,
    resetEntry,
    resetAll,
    manualApprove,
    rejectEntry,
    resetAndRestore,
    updateStatus,
    addLog,
  } as const;
}

export type UsePipelineReturn = ReturnType<typeof usePipeline>;
