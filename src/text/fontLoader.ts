import fontkit, { type Font } from '@pdf-lib/fontkit';
import { fontCatalogEntry } from './fontCatalog';

const bytesCache = new Map<string, Promise<Uint8Array>>();
const fontCache = new Map<string, Promise<Font>>();

/**
 * Fetches the raw .ttf bytes for a catalog entry, cached per fontId so a
 * font is only ever downloaded once no matter how many elements use it.
 * Shared by both consumers below — fontkit parses these bytes for layout,
 * pdf-lib embeds the same bytes for print — so there is exactly one copy of
 * the font in play, never two independently-fetched files that could drift.
 */
function loadBytes(fontId: string): Promise<Uint8Array> {
  let promise = bytesCache.get(fontId);
  if (!promise) {
    const entry = fontCatalogEntry(fontId);
    promise = fetch(entry.fileUrl).then((res) => {
      if (!res.ok) throw new Error(`Failed to load font "${fontId}" from ${entry.fileUrl}: ${res.status}`);
      return res.arrayBuffer();
    }).then((buf) => new Uint8Array(buf));
    bytesCache.set(fontId, promise);
  }
  return promise;
}

/** Parsed fontkit font for the text layout module — the single source of measurement (invariant 4). */
export function loadFont(fontId: string): Promise<Font> {
  let promise = fontCache.get(fontId);
  if (!promise) {
    promise = loadBytes(fontId).then((bytes) => fontkit.create(bytes) as Font);
    fontCache.set(fontId, promise);
  }
  return promise;
}

/** Raw bytes for `PDFDocument.embedFont`. */
export function loadFontBytes(fontId: string): Promise<Uint8Array> {
  return loadBytes(fontId);
}
