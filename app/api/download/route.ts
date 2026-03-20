import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import JSZip from 'jszip';

export async function GET(request: NextRequest) {
  try {
    const urlsParam = request.nextUrl.searchParams.get('urls');

    let urls: string[] = [];
    if (urlsParam) {
      urls = JSON.parse(urlsParam);
    } else {
      // List all blobs
      const { blobs } = await list();
      urls = blobs.map((b) => b.url);
    }

    if (urls.length === 0) {
      return NextResponse.json({ error: 'No images to download' }, { status: 400 });
    }

    const zip = new JSZip();

    await Promise.all(
      urls.map(async (url, index) => {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            const pathname = new URL(url).pathname;
            const filename = pathname.split('/').pop() || `image-${index + 1}.png`;
            zip.file(filename, buffer);
          }
        } catch (e) {
          console.error(`Failed to fetch ${url}:`, e);
        }
      })
    );

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="approved-images.zip"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed';
    console.error('Download error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
