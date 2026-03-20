'use client';

import { EntryStatus } from '@/lib/types';

const statusConfig: Record<
  EntryStatus,
  { label: string; bg: string; text: string; icon: string; animate?: string }
> = {
  pending: { label: 'Pending', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', icon: '○' },
  generating: { label: 'Generating...', bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-700 dark:text-yellow-300', icon: '⟳', animate: 'animate-spin' },
  verifying: { label: 'Checking...', bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300', icon: '◉', animate: 'animate-pulse-slow' },
  retrying: { label: 'Retrying', bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-700 dark:text-yellow-300', icon: '↻' },
  passed: { label: 'Passed', bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300', icon: '✓' },
  approved: { label: 'Approved', bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300', icon: '✓' },
  needs_review: { label: 'Needs Review', bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-700 dark:text-orange-300', icon: '⚠' },
  rejected: { label: 'Rejected', bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-300', icon: '✗' },
  failed: { label: 'Failed', bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-300', icon: '⊘' },
};

interface Props {
  status: EntryStatus;
  score?: number;
  attempts?: number;
}

export default function StatusBadge({ status, score, attempts }: Props) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} transition-all duration-300`}
    >
      <span className={config.animate || ''}>{config.icon}</span>
      {config.label}
      {status === 'retrying' && attempts && (
        <span className="opacity-75">{attempts}/3</span>
      )}
      {score !== undefined && (status === 'passed' || status === 'approved' || status === 'needs_review') && (
        <span className="ml-1 font-bold">{score}/10</span>
      )}
    </span>
  );
}
