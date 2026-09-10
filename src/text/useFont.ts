import { useEffect, useState } from 'react';
import type { Font } from '@pdf-lib/fontkit';
import { ensureFontFaceRegistered } from './fontFace';
import { loadFont } from './fontLoader';

const cache = new Map<string, Font>();

/**
 * Loads (and caches) the fontkit font for measurement, and registers the
 * matching browser FontFace so the SVG renderer paints the same glyph
 * outlines. Returns null until both are ready — callers render nothing for
 * that element in the meantime rather than falling back to a browser font,
 * which would violate invariant 4 the instant it painted anything.
 */
export function useFont(fontId: string): Font | null {
  const [, forceUpdate] = useState(0);
  const cached = cache.get(fontId) ?? null;

  useEffect(() => {
    if (cache.has(fontId)) return;
    let cancelled = false;
    Promise.all([loadFont(fontId), ensureFontFaceRegistered(fontId)]).then(([font]) => {
      if (cancelled) return;
      cache.set(fontId, font);
      forceUpdate((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [fontId]);

  return cached;
}
