'use client';

import { NotionEntry, EntryStatus, PipelineResult } from '@/lib/types';
import StatusBadge from './StatusBadge';

interface Props {
  entry: NotionEntry;
  status: EntryStatus;
  result?: PipelineResult;
  isCurrent: boolean;
  onGenerate: () => void;
  onApprove: () => void;
  onClick: () => void;
}

export default function EntryRow({
  entry,
  status,
  result,
  isCurrent,
  onGenerate,
  onApprove,
  onClick,
}: Props) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
        isCurrent ? 'bg-yellow-50 dark:bg-yellow-900/20 animate-pulse-slow' : ''
      }`}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
        {entry.day || '—'}
      </td>
      <td className="px-4 py-3">
        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {entry.contentType}
        </span>
        {(entry.contentType.toLowerCase().includes('video') || entry.contentType.toLowerCase().includes('reel')) && (
          <span className="ml-1 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300">
            Cover Only
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {entry.topic}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
        {entry.visualDescription.slice(0, 80)}
        {entry.visualDescription.length > 80 ? '...' : ''}
      </td>
      <td className="px-4 py-3">
        {result?.verification?.score !== undefined ? (
          <span
            className={`text-sm font-bold ${
              result.verification.score >= 7
                ? 'text-green-600 dark:text-green-400'
                : 'text-orange-600 dark:text-orange-400'
            }`}
          >
            {result.verification.score}/10
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          status={status}
          score={result?.verification?.score}
          attempts={result?.attempts}
        />
      </td>
      <td className="px-4 py-3 flex gap-1">
        {status === 'pending' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerate();
            }}
            className="px-3 py-1 text-xs font-medium text-white bg-sage-600 rounded hover:bg-sage-700 transition-colors"
          >
            Generate
          </button>
        )}
        {status === 'passed' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
          >
            Approve
          </button>
        )}
        {(status === 'approved' || status === 'needs_review') && result?.blobUrl && (
          <a
            href={result.blobUrl}
            download
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-1 text-xs font-medium text-sage-700 bg-sage-100 rounded hover:bg-sage-200 dark:text-sage-300 dark:bg-sage-800 dark:hover:bg-sage-700 transition-colors"
          >
            Download
          </a>
        )}
      </td>
    </tr>
  );
}
