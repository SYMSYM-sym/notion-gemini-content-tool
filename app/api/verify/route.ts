import { NextRequest, NextResponse } from 'next/server';
import { verifyImage } from '@/lib/verify';
import { NotionEntry } from '@/lib/types';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imageBase64: string = body.imageBase64;
    const entry: NotionEntry = body.entry;

    if (!imageBase64 || !entry) {
      return NextResponse.json(
        { error: 'imageBase64 and entry are required' },
        { status: 400 }
      );
    }

    const result = await verifyImage(imageBase64, entry);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    console.error('Verify error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
