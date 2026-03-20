import { NotionEntry } from './types';

export function extractDatabaseId(url: string): string {
  // Handle various Notion URL formats
  const cleaned = url.replace(/^https?:\/\/(www\.)?notion\.so\//, '');
  // Extract the 32-char hex ID
  const match = cleaned.match(/([a-f0-9]{32})/);
  if (match) return match[1];
  // Try with dashes
  const dashMatch = cleaned.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
  );
  if (dashMatch) return dashMatch[1].replace(/-/g, '');
  throw new Error('Could not extract database ID from URL');
}

function getTextValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : v?.[0] || '')).join('');
  }
  return String(value);
}

function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const normalizedCandidates = candidates.map(normalizeColumnName);
  for (const key of Object.keys(row)) {
    const nk = normalizeColumnName(key);
    for (const candidate of normalizedCandidates) {
      if (nk.includes(candidate) || candidate.includes(nk)) {
        return row[key];
      }
    }
  }
  return undefined;
}

export function parseNotionRows(rows: Record<string, unknown>[]): NotionEntry[] {
  return rows.map((row, index) => {
    const dayVal = findColumn(row, 'day');
    const day = dayVal ? parseInt(String(dayVal), 10) : null;

    return {
      id: (row.id as string) || `entry-${index}`,
      day: isNaN(day as number) ? null : day,
      contentType: getTextValue(findColumn(row, 'contenttype', 'content type')),
      platform: getTextValue(findColumn(row, 'platform')),
      topic: getTextValue(findColumn(row, 'topic')),
      visualDescription: getTextValue(
        findColumn(row, 'visualdescription', 'visual', 'description')
      ),
      caption: getTextValue(findColumn(row, 'captiontext', 'caption', 'text')),
      hashtags: getTextValue(findColumn(row, 'hashtags', 'hashtag')),
      hasExistingImage: !!findColumn(row, 'imagevideo', 'image', 'video'),
    };
  });
}

export async function fetchNotionDatabase(databaseId: string): Promise<NotionEntry[]> {
  // Strategy 1: Splitbee proxy
  try {
    const res = await fetch(
      `https://notion-api.splitbee.io/v1/table/${databaseId}`,
      { next: { revalidate: 300 } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return parseNotionRows(data);
      }
    }
  } catch {
    // Fall through to next strategy
  }

  // Strategy 2: notion-client
  try {
    const { NotionAPI } = await import('notion-client');
    const notion = new NotionAPI();
    const page = await notion.getPage(databaseId);
    const collectionId = Object.keys(page.collection || {})[0];
    if (collectionId) {
      // notion-client may double-nest: collection[id].value.value or collection[id].value
      const colRaw = page.collection[collectionId] as Record<string, unknown>;
      const colValue = (colRaw?.value as Record<string, unknown>) || colRaw;
      const colInner = (colValue?.value as Record<string, unknown>) || colValue;
      const schema = (colInner?.schema as Record<string, { name: string; type: string }>) || {};
      const blockIds = Object.keys(page.block || {});

      const rows: Record<string, unknown>[] = [];
      for (const blockId of blockIds) {
        const blockRaw = page.block[blockId] as Record<string, unknown>;
        const blockOuter = (blockRaw?.value as Record<string, unknown>) || blockRaw;
        const block = (blockOuter?.value as Record<string, unknown>) || blockOuter;
        if (block?.type === 'page' && block?.properties) {
          const props = block.properties as Record<string, unknown>;
          const row: Record<string, unknown> = { id: blockId };
          for (const [propId, propSchema] of Object.entries(schema)) {
            const val = props[propId];
            if (val) {
              row[propSchema.name] = Array.isArray(val)
                ? val.map((v: unknown[]) => v[0]).join('')
                : val;
            }
          }
          rows.push(row);
        }
      }
      if (rows.length > 0) {
        return parseNotionRows(rows);
      }
    }
  } catch {
    // Fall through
  }

  throw new Error(
    'Could not fetch Notion database. Make sure the page is public and the URL is correct.'
  );
}
