'use client';

import { EntryStatus } from '@/lib/types';

interface Props {
  platform: string;
  onPlatformChange: (p: string) => void;
  statusFilter: string;
  onStatusChange: (s: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
}

export default function FilterBar({
  platform,
  onPlatformChange,
  statusFilter,
  onStatusChange,
  search,
  onSearchChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Platform:
        <select
          value={platform}
          onChange={(e) => onPlatformChange(e.target.value)}
          className="ml-2 px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white"
        >
          <option value="Instagram">Instagram</option>
          <option value="TikTok">TikTok</option>
          <option value="All">All</option>
        </select>
      </label>

      <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
        Status:
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="ml-2 px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="needs_review">Needs Review</option>
          <option value="failed">Failed</option>
          <option value="generating">In Progress</option>
        </select>
      </label>

      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search topics..."
        className="px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-sage-500"
      />
    </div>
  );
}
