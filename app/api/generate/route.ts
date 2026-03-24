import { NextRequest, NextResponse } from 'next/server';
import { generateImages } from '@/lib/gemini';
import { NotionEntry, VerificationResult } from '@/lib/types';

// Carousels generate multiple slides sequentially — 4 slides × ~15s each = 60s
// Add headroom for retries and rate limiting
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry: NotionEntry = body.entry;
    const previousFeedback: VerificationResult | undefined = body.previousFeedback;

    if (!entry) {
      return NextResponse.json({ error: 'No entry provided' }, { status: 400 });
    }

    const { images, prompts } = await generateImages(entry, previousFeedback);

    return NextResponse.json({
      imageBase64: images[0],
      images,
      prompt: prompts[0],
      prompts,
      slideCount: images.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image generation failed';
    console.error('Generate error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
