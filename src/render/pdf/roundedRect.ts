import type { PDFOperator } from 'pdf-lib';
import type { Mm } from '../../model/types';
import type { Rect } from '../../model/geometry';
import { boxCenter } from '../../model/geometry';
import { pathToPdfPathOperators, pathToSvgPath, rotatePath, type VectorPath } from './path';

/** Bezier control-point offset that approximates a quarter circle. */
const KAPPA = 0.5522847498;

/**
 * Builds a rounded-rectangle path in model space, optionally pre-rotated
 * about the box centre. `radius: 0` degenerates to a plain rectangle, so
 * this is the one path builder rect elements (and the plain-rect template
 * shape) use regardless of whether they have a radius.
 */
export function buildRoundedRectPath(rect: Rect, radius: Mm, rotationDeg = 0): VectorPath {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const { x, y, width: w, height: h } = rect;
  const k = r * KAPPA;

  const path: VectorPath =
    r === 0
      ? {
          start: { x, y },
          segments: [
            { line: { x: x + w, y } },
            { line: { x: x + w, y: y + h } },
            { line: { x, y: y + h } },
            { line: { x, y } },
          ],
        }
      : {
          // Traversal starts at the top-left corner's end (just right of the
          // corner arc) and goes clockwise: across the top, down the right,
          // across the bottom, up the left, closing back at the start.
          start: { x: x + r, y },
          segments: [
            { line: { x: x + w - r, y } },
            { curve: { c1: { x: x + w - r + k, y }, c2: { x: x + w, y: y + r - k }, end: { x: x + w, y: y + r } } },
            { line: { x: x + w, y: y + h - r } },
            {
              curve: {
                c1: { x: x + w, y: y + h - r + k },
                c2: { x: x + w - r + k, y: y + h },
                end: { x: x + w - r, y: y + h },
              },
            },
            { line: { x: x + r, y: y + h } },
            { curve: { c1: { x: x + r - k, y: y + h }, c2: { x, y: y + h - r + k }, end: { x, y: y + h - r } } },
            { line: { x, y: y + r } },
            { curve: { c1: { x, y: y + r - k }, c2: { x: x + r - k, y }, end: { x: x + r, y } } },
          ],
        };

  return rotationDeg === 0 ? path : rotatePath(path, boxCenter(rect), rotationDeg);
}

/** Renders a rounded-rect path as SVG `<path>` `d` attribute data, in mm user units. */
export function roundedRectToSvgPath(rect: Rect, radius: Mm, rotationDeg = 0): string {
  return pathToSvgPath(buildRoundedRectPath(rect, radius, rotationDeg));
}

/**
 * Renders a rounded-rect path as PDF path-construction operators, in points
 * with the y-axis flipped for PDF's bottom-left origin. Does not include the
 * surrounding clip/paint operators — callers compose those (see
 * `roundedRectClipOps` usage in shapeOutline.ts / elements.ts).
 */
export function roundedRectToPdfPathOperators(
  rect: Rect,
  radius: Mm,
  pageHeightMm: Mm,
  rotationDeg = 0,
): PDFOperator[] {
  return pathToPdfPathOperators(buildRoundedRectPath(rect, radius, rotationDeg), pageHeightMm);
}
