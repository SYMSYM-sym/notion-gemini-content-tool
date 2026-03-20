export interface NotionEntry {
  id: string;
  day: number | null;
  contentType: string;
  platform: string;
  topic: string;
  visualDescription: string;
  caption: string;
  hashtags: string;
  hasExistingImage: boolean;
}

export type EntryStatus =
  | 'pending'
  | 'generating'
  | 'verifying'
  | 'retrying'
  | 'approved'
  | 'needs_review'
  | 'rejected'
  | 'failed';

export interface VerificationResult {
  score: number;
  matches: boolean;
  feedback: string;
  missingElements: string[];
  unwantedElements: string[];
}

export interface PipelineResult {
  entryId: string;
  status: EntryStatus;
  imageBase64?: string;
  images?: string[];
  prompt?: string;
  blobUrl?: string;
  blobUrls?: string[];
  verification?: VerificationResult;
  attempts: number;
}

export interface LogEntry {
  timestamp: Date;
  message: string;
  entryId?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}
