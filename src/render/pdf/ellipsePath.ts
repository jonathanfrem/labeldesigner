import type { PDFOperator } from 'pdf-lib';
import type { Rect } from '../../model/geometry';
import { boxCenter } from '../../model/geometry';
import { pathToPdfPathOperators, pathToSvgPath, rotatePath, type VectorPath } from './path';

/** Bezier control-point offset that approximates a quarter circle. */
const KAPPA = 0.5522847498;

/**
 * Builds an ellipse (inscribed in `rect`) as a four-arc bezier path in model
 * space, optionally pre-rotated about the box centre. Built the same way as
 * `buildRoundedRectPath` so the two curved shapes share one mental model —
 * an ellipse is just a rounded rect whose corner arcs have eaten the edges.
 */
export function buildEllipsePath(rect: Rect, rotationDeg = 0): VectorPath {
  const { x: cx, y: cy } = boxCenter(rect);
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;

  const top = { x: cx, y: cy - ry };
  const right = { x: cx + rx, y: cy };
  const bottom = { x: cx, y: cy + ry };
  const left = { x: cx - rx, y: cy };

  const path: VectorPath = {
    start: top,
    segments: [
      { curve: { c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky }, end: right } },
      { curve: { c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry }, end: bottom } },
      { curve: { c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky }, end: left } },
      { curve: { c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry }, end: top } },
    ],
  };

  return rotationDeg === 0 ? path : rotatePath(path, { x: cx, y: cy }, rotationDeg);
}

export function ellipseToSvgPath(rect: Rect, rotationDeg = 0): string {
  return pathToSvgPath(buildEllipsePath(rect, rotationDeg));
}

export function ellipseToPdfPathOperators(rect: Rect, pageHeightMm: number, rotationDeg = 0): PDFOperator[] {
  return pathToPdfPathOperators(buildEllipsePath(rect, rotationDeg), pageHeightMm);
}
