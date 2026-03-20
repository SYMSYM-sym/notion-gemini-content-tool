'use client';

import { useState, useEffect, useRef } from 'react';
import { LogEntry } from '@/lib/types';

const typeColors: Record<LogEntry['type'], string> = {
  info: 'text-gray-500 dark:text-gray-400',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  error: 'text-red-600 dark:text-red-400',
};

interface Props {
  log: LogEntry[];
}

export default function PipelineLog({ log }: Props) {
  const [visible, setVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log]);

  if (log.length === 0) return null;

  return (
    <div className="border rounded-lg border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Pipeline Log
        </span>
        <button
          onClick={() => setVisible(!visible)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {visible && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto p-3 bg-white dark:bg-gray-900 font-mono text-xs space-y-1"
        >
          {log.map((entry, i) => (
            <div key={i} className={typeColors[entry.type]}>
              <span className="opacity-60">
                {entry.timestamp.toLocaleTimeString()}
              </span>{' '}
              {entry.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
