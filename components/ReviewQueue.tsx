'use client';

import { NotionEntry, PipelineResult } from '@/lib/types';
import VerificationDetails from './VerificationDetails';

interface Props {
  entries: NotionEntry[];
  results: Map<string, PipelineResult>;
  onApprove: (entryId: string) => void;
  onReject: (entryId: string) => void;
  onRegenerate: (entry: NotionEntry) => void;
}

export default function ReviewQueue({
  entries,
  results,
  onApprove,
  onReject,
  onRegenerate,
}: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No entries need review.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Needs Review ({entries.length})
      </h3>
      {entries.map((entry) => {
        const result = results.get(entry.id);
        return (
          <div
            key={entry.id}
            className="border rounded-lg border-orange-200 dark:border-orange-800 overflow-hidden"
          >
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20">
              <div className="flex items-start gap-4">
                {result?.imageBase64 && (
                  <img
                    src={`data:image/png;base64,${result.imageBase64}`}
                    alt={entry.topic}
                    className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Day {entry.day} — {entry.topic}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {entry.contentType}
                  </p>
                  {result?.verification && (
                    <VerificationDetails verification={result.verification} />
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-3 bg-white dark:bg-gray-800 border-t border-orange-200 dark:border-orange-800">
              <button
                onClick={() => onApprove(entry.id)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
              >
                Approve Anyway
              </button>
              <button
                onClick={() => onRegenerate(entry)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={() => onReject(entry.id)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
