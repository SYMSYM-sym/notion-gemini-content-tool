import { NextRequest, NextResponse } from 'next/server';
import { generateVideo } from '@/lib/gemini';
import { NotionEntry } from '@/lib/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry: NotionEntry = body.entry;

    if (!entry) {
      return NextResponse.json({ error: 'No entry provided' }, { status: 400 });
    }

    const { videoUrl, prompt } = await generateVideo(entry);

    // Download the video from fal.ai and convert to base64
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error('Failed to download generated video');
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const videoBase64 = videoBuffer.toString('base64');

    return NextResponse.json({
      videoBase64,
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
