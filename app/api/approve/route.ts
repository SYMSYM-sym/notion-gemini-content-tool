import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { NotionEntry } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry: NotionEntry = body.entry;

    if (!entry) {
      return NextResponse.json({ error: 'entry is required' }, { status: 400 });
    }

    const isVideo = !!body.videoBase64;
    const base64Data: string = body.videoBase64 || body.imageBase64;

    if (!base64Data) {
      return NextResponse.json({ error: 'imageBase64 or videoBase64 is required' }, { status: 400 });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const slideIndex: number | undefined = body.slideIndex;
    const day = entry.day || 'X';
    const platform = entry.platform || 'Instagram';
    const topic = entry.topic.replace(/[^a-z0-9 ]/gi, '').replace(/\s+/g, ' ').trim();
    const slideSuffix = slideIndex !== undefined ? ` - Slide ${slideIndex + 1}` : '';
    const ext = isVideo ? 'mp4' : 'png';
    const contentType = isVideo ? 'video/mp4' : 'image/png';
    const filename = `Day ${day} - ${platform} - ${topic}${slideSuffix}.${ext}`;

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType,
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
