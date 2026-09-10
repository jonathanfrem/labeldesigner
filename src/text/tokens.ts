export type ContentSegment = { type: 'text'; value: string } | { type: 'field'; name: string } | { type: 'counter' };

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Splits element content on `{{Field}}` / `{{counter}}` tokens. M3 has no
 * merge UI — every segment renders literally (see `renderLiteral`) — but the
 * parser exists now so M7's data binding doesn't need to touch every element
 * type again to retrofit it.
 */
export function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(TOKEN_RE)) {
    const index = match.index;
    if (index > lastIndex) segments.push({ type: 'text', value: content.slice(lastIndex, index) });
    const inner = match[1];
    segments.push(inner === 'counter' ? { type: 'counter' } : { type: 'field', name: inner });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) segments.push({ type: 'text', value: content.slice(lastIndex) });
  return segments;
}

/** M3's rendering: every token becomes its own literal `{{...}}` text. */
export function renderLiteral(segments: ContentSegment[]): string {
  return segments.map((s) => (s.type === 'text' ? s.value : s.type === 'counter' ? '{{counter}}' : `{{${s.name}}}`)).join('');
}
