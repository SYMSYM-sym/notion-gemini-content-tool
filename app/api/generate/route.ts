import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/gemini';
import { NotionEntry, VerificationResult } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry: NotionEntry = body.entry;
    const previousFeedback: VerificationResult | undefined = body.previousFeedback;

    if (!entry) {
      return NextResponse.json({ error: 'No entry provided' }, { status: 400 });
    }

    const result = await generateImage(entry, previousFeedback);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image generation failed';
    console.error('Generate error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
