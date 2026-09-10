import { loadFontBytes } from './fontLoader';

const registered = new Map<string, Promise<void>>();

/**
 * Registers a fontId with the browser's FontFace API, keyed by fontId as the
 * CSS font-family name, so the SVG renderer can paint the exact same glyph
 * outlines pdf-lib embeds. This never feeds text measurement — layout.ts
 * gets every position from fontkit before this resolves — it only makes the
 * browser's rasteriser draw the right shape at the position we computed.
 */
export function ensureFontFaceRegistered(fontId: string): Promise<void> {
  let promise = registered.get(fontId);
  if (!promise) {
    promise = loadFontBytes(fontId).then(async (bytes) => {
      const face = new FontFace(fontId, bytes.buffer as ArrayBuffer);
      await face.load();
      document.fonts.add(face);
    });
    registered.set(fontId, promise);
  }
  return promise;
}
