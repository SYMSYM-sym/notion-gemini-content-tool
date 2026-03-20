'use client';

import { useState } from 'react';

interface Props {
  onLoad: (url: string) => void;
  isLoading: boolean;
  defaultUrl?: string;
}

export default function NotionUrlInput({ onLoad, isLoading, defaultUrl }: Props) {
  const [url, setUrl] = useState(defaultUrl || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) onLoad(url.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste Notion database URL..."
        className="flex-1 px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-sage-500 dark:text-white"
      />
      <button
        type="submit"
        disabled={isLoading || !url.trim()}
        className="px-4 py-2 text-sm font-medium text-white bg-sage-600 rounded-lg hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Loading...' : 'Load'}
      </button>
    </form>
  );
}
