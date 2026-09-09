import { rgb, type Color } from 'pdf-lib';

/** Parses a `#rrggbb` or `#rgb` hex string. The only color format elements use in M2. */
export function hexToRgb(hex: string): Color {
  const clean = hex.replace('#', '');
  const expanded =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(expanded.substring(0, 2), 16) / 255;
  const g = parseInt(expanded.substring(2, 4), 16) / 255;
  const b = parseInt(expanded.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}
