import { NextRequest, NextResponse } from 'next/server';
import { extractDatabaseId, fetchNotionDatabase } from '@/lib/notion';

// Never cache — always fetch fresh data from Notion
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    const defaultUrl = process.env.DEFAULT_NOTION_URL;
    const notionUrl = url || defaultUrl;

    if (!notionUrl) {
      return NextResponse.json(
        { error: 'No Notion URL provided' },
        { status: 400 }
      );
    }

    const databaseId = extractDatabaseId(notionUrl);
    const entries = await fetchNotionDatabase(databaseId);

    return NextResponse.json({ entries, databaseId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Notion data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
