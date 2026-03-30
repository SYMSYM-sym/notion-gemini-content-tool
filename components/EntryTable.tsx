'use client';

import { NotionEntry, EntryStatus, PipelineResult } from '@/lib/types';
import EntryRow from './EntryRow';

interface Props {
  entries: NotionEntry[];
  statuses: Map<string, EntryStatus>;
  results: Map<string, PipelineResult>;
  currentEntryId: string | null;
  onGenerate: (entry: NotionEntry) => void;
  onApprove: (entry: NotionEntry) => void;
  onRowClick: (entry: NotionEntry) => void;
}

export default function EntryTable({
  entries,
  statuses,
  results,
  currentEntryId,
  onGenerate,
  onApprove,
  onRowClick,
}: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No entries found. Load a Notion database to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-lg border-gray-200 dark:border-gray-700">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Day
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Platform
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Topic
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Description
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Score
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              status={statuses.get(entry.id) || 'pending'}
              result={results.get(entry.id)}
              isCurrent={entry.id === currentEntryId}
              onGenerate={() => onGenerate(entry)}
              onApprove={() => onApprove(entry)}
              onClick={() => onRowClick(entry)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
