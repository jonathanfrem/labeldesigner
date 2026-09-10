import type { Mm } from '../model/types';
import { ptToMm } from '../text/layout';

/** Monospace reads best for a string of digits/letters under a barcode. */
export const DEFAULT_HRI_FONT_ID = 'jetbrains-mono-regular';
export const DEFAULT_HRI_FONT_SIZE_PT = 8;

/** Vertical space reserved below the bars for the human-readable interpretation line. */
export function hriBandHeightMm(fontSizePt: number): Mm {
  return ptToMm(fontSizePt) * 1.3;
}
