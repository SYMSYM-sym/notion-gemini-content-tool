import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { NotionEntry } from '@/lib/types';

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

    const buffer = Buffer.from(imageBase64, 'base64');
    const slideIndex: number | undefined = body.slideIndex;
    const day = entry.day || 'X';
    const topic = entry.topic.replace(/[^a-z0-9 ]/gi, '').replace(/\s+/g, ' ').trim();
    const slideSuffix = slideIndex !== undefined ? ` - Slide ${slideIndex + 1}` : '';
    const filename = `Day ${day} - ${topic}${slideSuffix}.png`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'image/png',
    });

    return NextResponse.json({
      url: blob.url,
      downloadUrl: blob.downloadUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    console.error('Approve error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
