import type { Mm } from '../../model/types';

/**
 * The only place mm-to-pt conversion and the PDF y-axis flip happen. Every
 * other module works in millimetres with a top-left origin, matching the
 * SVG/model coordinate space; convert at the last possible moment when
 * emitting PDF operators.
 */
export const MM_TO_PT = 72 / 25.4;

export function mmToPt(mm: Mm): number {
  return mm * MM_TO_PT;
}

/** Converts a model y-coordinate (top-down, mm) to a PDF y-coordinate (bottom-up, pt). */
export function yFlip(yMm: Mm, pageHeightMm: Mm): number {
  return mmToPt(pageHeightMm - yMm);
}
