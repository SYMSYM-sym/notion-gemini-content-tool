'use client';

import { NotionEntry, PipelineResult } from '@/lib/types';
import VerificationDetails from './VerificationDetails';

interface Props {
  entry: NotionEntry;
  result?: PipelineResult;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

export default function PreviewModal({
  entry,
  result,
  onClose,
  onApprove,
  onReject,
  onRegenerate,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Day {entry.day} — {entry.topic}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {(() => {
            const blobUrls = result?.blobUrls || (result?.blobUrl ? [result.blobUrl] : []);
            const images = result?.images || (result?.imageBase64 ? [result.imageBase64] : []);
            const displayUrls = blobUrls.length > 0 ? blobUrls : [];
            const displayB64 = blobUrls.length > 0 ? [] : images;

            if (displayUrls.length > 0) {
              return (
                <div className={displayUrls.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
                  {displayUrls.map((url, i) => (
                    <div key={i} className="relative">
                      {displayUrls.length > 1 && (
                        <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                          Slide {i + 1}
                        </span>
                      )}
                      <img src={url} alt={`${entry.topic} slide ${i + 1}`} className="w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              );
            }
            if (displayB64.length > 0) {
              return (
                <div className={displayB64.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
                  {displayB64.map((b64, i) => (
                    <div key={i} className="relative">
                      {displayB64.length > 1 && (
                        <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                          Slide {i + 1}
                        </span>
                      )}
                      <img src={`data:image/png;base64,${b64}`} alt={`${entry.topic} slide ${i + 1}`} className="w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div className="flex items-center justify-center h-48 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {result?.status === 'failed'
                    ? 'Image generation failed — no image was produced'
                    : 'No image available yet'}
                </p>
              </div>
            );
          })()}

          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Type:</span> {entry.contentType}
              {(entry.contentType.toLowerCase().includes('video') || entry.contentType.toLowerCase().includes('reel')) && (
                <span className="ml-2 inline-block px-2 py-0.5 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300">
                  Cover image only — video generation not supported
                </span>
              )}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Visual Direction:</span>{' '}
              {entry.visualDescription}
            </p>
            {entry.caption && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Caption:</span> {entry.caption}
              </p>
            )}
            {entry.hashtags && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Hashtags:</span> {entry.hashtags}
              </p>
            )}
          </div>

          {result?.verification && (
            <VerificationDetails verification={result.verification} />
          )}

          <div className="text-xs text-gray-400">
            Attempts: {result?.attempts || 0}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          {(result?.blobUrls || result?.blobUrl || result?.imageBase64 || result?.images) && (
            <button
              onClick={async () => {
                const b64s = result?.images || (result?.imageBase64 ? [result.imageBase64] : []);
                const urls = result?.blobUrls || (result?.blobUrl ? [result.blobUrl] : []);

                for (let i = 0; i < Math.max(b64s.length, urls.length); i++) {
                  const filename = `Day ${entry.day || 'X'} - ${entry.platform} - ${entry.topic}${Math.max(b64s.length, urls.length) > 1 ? ` - Slide ${i + 1}` : ''}.png`;

                  if (urls[i]) {
                    // Fetch cross-origin blob URL and create downloadable object URL
                    try {
                      const res = await fetch(urls[i]);
                      const blob = await res.blob();
                      const objUrl = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = objUrl;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(objUrl);
                    } catch {
                      window.open(urls[i], '_blank');
                    }
                  } else if (b64s[i]) {
                    const a = document.createElement('a');
                    a.href = `data:image/png;base64,${b64s[i]}`;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }

                  // Small delay between downloads so browser doesn't block them
                  if (i < Math.max(b64s.length, urls.length) - 1) {
                    await new Promise(r => setTimeout(r, 500));
                  }
                }
              }}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-sage-600 rounded-lg hover:bg-sage-700 transition-colors"
            >
              Download{(result?.images?.length || 0) > 1 ? ` All ${result!.images!.length} Slides` : ''}
            </button>
          )}
          <button
            onClick={onApprove}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={onRegenerate}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Regenerate
          </button>
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
