import { appendBezierCurve, closePath, lineTo, moveTo, type PDFOperator } from 'pdf-lib';
import type { Mm } from '../../model/types';
import type { Rect } from '../../model/geometry';
import { mmToPt, yFlip } from './units';

/** Bezier control-point offset that approximates a quarter circle. */
const KAPPA = 0.5522847498;

interface Point {
  x: Mm;
  y: Mm;
}

interface CubicSegment {
  /** Control point 1, control point 2, end point — all in model (top-left, mm) space. */
  c1: Point;
  c2: Point;
  end: Point;
}

export interface RoundedRectPath {
  start: Point;
  /** Four straight or curved segments, in order: top edge, right edge, bottom edge, left edge. */
  segments: Array<{ line?: Point; curve?: CubicSegment }>;
}

/**
 * Builds a rounded-rectangle path as an ordered list of line/curve segments
 * in model space (mm, top-left origin, y grows downward). Both renderers
 * consume this same structure so the geometry can't drift between them.
 *
 * Traversal starts at the top-left corner's end (just right of the corner
 * arc) and goes clockwise: across the top, down the right, across the
 * bottom, up the left, closing back at the start.
 */
export function buildRoundedRectPath(rect: Rect, radius: Mm): RoundedRectPath {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const { x, y, width: w, height: h } = rect;
  const k = r * KAPPA;

  if (r === 0) {
    const start = { x, y };
    return {
      start,
      segments: [
        { line: { x: x + w, y } },
        { line: { x: x + w, y: y + h } },
        { line: { x, y: y + h } },
        { line: { x, y } },
      ],
    };
  }

  const start = { x: x + r, y };

  return {
    start,
    segments: [
      // Top edge to top-right corner start.
      { line: { x: x + w - r, y } },
      // Top-right corner arc.
      { curve: { c1: { x: x + w - r + k, y }, c2: { x: x + w, y: y + r - k }, end: { x: x + w, y: y + r } } },
      // Right edge to bottom-right corner start.
      { line: { x: x + w, y: y + h - r } },
      // Bottom-right corner arc.
      {
        curve: {
          c1: { x: x + w, y: y + h - r + k },
          c2: { x: x + w - r + k, y: y + h },
          end: { x: x + w - r, y: y + h },
        },
      },
      // Bottom edge to bottom-left corner start.
      { line: { x: x + r, y: y + h } },
      // Bottom-left corner arc.
      { curve: { c1: { x: x + r - k, y: y + h }, c2: { x, y: y + h - r + k }, end: { x, y: y + h - r } } },
      // Left edge to top-left corner start.
      { line: { x, y: y + r } },
      // Top-left corner arc, closing back at `start`.
      { curve: { c1: { x, y: y + r - k }, c2: { x: x + r - k, y }, end: { x: x + r, y } } },
    ],
  };
}

/** Renders a rounded-rect path as SVG `<path>` `d` attribute data, in mm user units. */
export function roundedRectToSvgPath(rect: Rect, radius: Mm): string {
  const path = buildRoundedRectPath(rect, radius);
  const parts: string[] = [`M ${fmt(path.start.x)} ${fmt(path.start.y)}`];
  for (const segment of path.segments) {
    if (segment.line) {
      parts.push(`L ${fmt(segment.line.x)} ${fmt(segment.line.y)}`);
    } else if (segment.curve) {
      const { c1, c2, end } = segment.curve;
      parts.push(`C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`);
    }
  }
  parts.push('Z');
  return parts.join(' ');
}

function fmt(n: number): string {
  return Number(n.toFixed(6)).toString();
}

/**
 * Renders a rounded-rect path as PDF path-construction operators (moveTo,
 * lineTo, cubic bezier curves, closePath), in points with the y-axis
 * flipped for PDF's bottom-left origin. Does not include the surrounding
 * clip/paint operators — callers compose those (see `roundedRectClipOps`).
 */
export function roundedRectToPdfPathOperators(rect: Rect, radius: Mm, pageHeightMm: Mm): PDFOperator[] {
  const path = buildRoundedRectPath(rect, radius);
  const toPt = (p: Point) => ({ x: mmToPt(p.x), y: yFlip(p.y, pageHeightMm) });

  const start = toPt(path.start);
  const ops: PDFOperator[] = [moveTo(start.x, start.y)];

  for (const segment of path.segments) {
    if (segment.line) {
      const p = toPt(segment.line);
      ops.push(lineTo(p.x, p.y));
    } else if (segment.curve) {
      const c1 = toPt(segment.curve.c1);
      const c2 = toPt(segment.curve.c2);
      const end = toPt(segment.curve.end);
      ops.push(appendBezierCurve(c1.x, c1.y, c2.x, c2.y, end.x, end.y));
    }
  }

  ops.push(closePath());
  return ops;
}
