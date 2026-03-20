'use client';

import { VerificationResult } from '@/lib/types';

interface Props {
  verification: VerificationResult;
}

export default function VerificationDetails({ verification }: Props) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">Score:</span>
        <span
          className={`font-bold ${
            verification.score >= 7
              ? 'text-green-600 dark:text-green-400'
              : verification.score >= 4
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {verification.score}/10
        </span>
      </div>
      <p className="text-gray-600 dark:text-gray-400">{verification.feedback}</p>
      {verification.missingElements.length > 0 && (
        <div>
          <span className="font-medium text-orange-600 dark:text-orange-400">
            Missing:{' '}
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            {verification.missingElements.join(', ')}
          </span>
        </div>
      )}
      {verification.unwantedElements.length > 0 && (
        <div>
          <span className="font-medium text-red-600 dark:text-red-400">
            Unwanted:{' '}
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            {verification.unwantedElements.join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
