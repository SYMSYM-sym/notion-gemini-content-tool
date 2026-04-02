import { NextRequest, NextResponse } from 'next/server';
import { generateVideo } from '@/lib/gemini';
import { NotionEntry } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry: NotionEntry = body.entry;
    const theme: string | undefined = body.theme;

    if (!entry) {
      return NextResponse.json({ error: 'No entry provided' }, { status: 400 });
    }

    const { videoUrl, prompt } = await generateVideo(entry, theme);

    // Return the fal.ai CDN URL directly — don't download here to avoid
    // Vercel's 4.5MB response limit (a 1080p video is 20-100MB).
    // The approve route will stream from this URL to Vercel Blob.
    return NextResponse.json({
      videoUrl,
      prompt,
      isVideo: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video generation failed';
    console.error('Generate video error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
