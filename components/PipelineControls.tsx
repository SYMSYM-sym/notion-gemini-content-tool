'use client';

interface Props {
  isRunning: boolean;
  isPaused: boolean;
  processed: number;
  total: number;
  pendingCount: number;
  passedCount: number;
  approvedCount: number;
  reviewCount: number;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  currentTopic?: string;
}

export default function PipelineControls({
  isRunning,
  isPaused,
  processed,
  total,
  pendingCount,
  passedCount,
  approvedCount,
  reviewCount,
  onStart,
  onPause,
  onStop,
  currentTopic,
}: Props) {
  const progress = total > 0 ? (processed / total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={pendingCount === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Generate All Pending ({pendingCount})
          </button>
        ) : (
          <>
            <button
              onClick={onPause}
              className="px-4 py-2 text-sm font-semibold text-white bg-yellow-500 rounded-lg hover:bg-yellow-600 transition-colors"
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={onStop}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
            >
              Stop
            </button>
          </>
        )}

        {isRunning && total > 0 && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Processing {processed + 1} of {total}
            {currentTopic && <span className="ml-1">— {currentTopic}</span>}
          </span>
        )}
      </div>

      {isRunning && total > 0 && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-sage-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
        <span>{total || pendingCount + passedCount + approvedCount + reviewCount} total</span>
        <span className="text-blue-600 dark:text-blue-400">{passedCount} passed</span>
        <span className="text-green-600 dark:text-green-400">{approvedCount} approved</span>
        <span className="text-orange-600 dark:text-orange-400">{reviewCount} needs review</span>
        <span>{pendingCount} pending</span>
      </div>
    </div>
  );
}
