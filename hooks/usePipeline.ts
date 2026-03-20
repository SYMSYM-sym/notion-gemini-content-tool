'use client';

import { useState, useCallback, useRef } from 'react';
import { NotionEntry, EntryStatus, VerificationResult, PipelineResult, LogEntry } from '@/lib/types';

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

  const processEntry = useCallback(
    async (entry: NotionEntry): Promise<PipelineResult> => {
      let attempts = 0;
      let lastFeedback: VerificationResult | null = null;
      let lastImageBase64: string | undefined;

      while (attempts < 3) {
        attempts++;

        // Step 1: Generate
        updateStatus(entry.id, 'generating');
        addLog(
          `Day ${entry.day} - ${entry.topic}: Generating image (attempt ${attempts}/3)...`,
          'info',
          entry.id
        );

        let imageBase64: string;
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
          imageBase64 = data.imageBase64;
          prompt = data.prompt;
          lastImageBase64 = imageBase64;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Generation failed';
          addLog(`Day ${entry.day} - ${entry.topic}: Error - ${msg}`, 'error', entry.id);

          // Retry generation once on API error
          if (attempts === 1) {
            addLog(`Day ${entry.day} - ${entry.topic}: Retrying generation...`, 'warning', entry.id);
            continue;
          }

          updateStatus(entry.id, 'failed');
          const result: PipelineResult = {
            entryId: entry.id,
            status: 'failed',
            imageBase64: lastImageBase64,
            attempts,
          };
          updateResult(entry.id, result);
          return result;
        }

        // Step 2: Verify
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
            body: JSON.stringify({ imageBase64, entry }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Verification failed');
          }
          verification = await res.json();
        } catch (error) {
          // If verification fails, auto-approve with a note
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
          // Approve
          updateStatus(entry.id, 'approved');
          let blobUrl: string | undefined;
          try {
            const res = await fetch('/api/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64, entry }),
            });
            if (res.ok) {
              const data = await res.json();
              blobUrl = data.url;
            }
          } catch {
            // Blob upload failed but image is still approved
          }

          addLog(
            `Day ${entry.day} - ${entry.topic}: Auto-approved (${verification.score}/10)`,
            'success',
            entry.id
          );
          const result: PipelineResult = {
            entryId: entry.id,
            status: 'approved',
            imageBase64,
            prompt,
            blobUrl,
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
        imageBase64: lastImageBase64,
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

        // Rate limit cooldown
        if (i < pendingEntries.length - 1 && runningRef.current && !pauseRef.current) {
          addLog('Cooling down (2s)...', 'info');
          await delay(2000);
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
    async (entryId: string) => {
      const result = results.get(entryId);
      if (!result?.imageBase64) return;

      updateStatus(entryId, 'approved');
      addLog(`Manually approved entry ${entryId}`, 'success', entryId);

      // Upload to blob
      try {
        const res = await fetch('/api/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: result.imageBase64,
            entry: { id: entryId, day: null, topic: entryId } as NotionEntry,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          updateResult(entryId, { ...result, status: 'approved', blobUrl: data.url });
        }
      } catch {
        // Still marked as approved locally
      }
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
    manualApprove,
    rejectEntry,
    updateStatus,
    addLog,
  } as const;
}

export type UsePipelineReturn = ReturnType<typeof usePipeline>;
