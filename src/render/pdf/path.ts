import { appendBezierCurve, closePath, lineTo, moveTo, type PDFOperator } from 'pdf-lib';
import type { Mm } from '../../model/types';
import { rotatePoint, type Point } from '../../model/geometry';
import { mmToPt, yFlip } from './units';

export interface CubicSegment {
  /** Control point 1, control point 2, end point — all in model (top-left, mm) space. */
  c1: Point;
  c2: Point;
  end: Point;
}

export interface PathSegment {
  line?: Point;
  curve?: CubicSegment;
}

/**
 * An ordered list of line/curve segments in model space (mm, top-left
 * origin, y grows downward). Both renderers consume this same structure —
 * rect, rounded-rect and ellipse paths are all built as one of these — so
 * geometry can't drift between the SVG and PDF paths.
 */
export interface VectorPath {
  start: Point;
  segments: PathSegment[];
}

/**
 * Maps every point in a path through an arbitrary function. The one place
 * any geometric transform (element rotation, sheet-slot placement) gets
 * applied to a shape — always as literal point math, never a renderer-native
 * transform primitive, so a path can pass through as many of these as
 * needed before either renderer converts it to its own drawing commands.
 */
export function mapPath(path: VectorPath, fn: (p: Point) => Point): VectorPath {
  return {
    start: fn(path.start),
    segments: path.segments.map((segment) =>
      segment.line
        ? { line: fn(segment.line) }
        : { curve: { c1: fn(segment.curve!.c1), c2: fn(segment.curve!.c2), end: fn(segment.curve!.end) } },
    ),
  };
}

/** Rotates every point in a path about `center`, in mm model space. */
export function rotatePath(path: VectorPath, center: Point, degreesClockwise: number): VectorPath {
  if (degreesClockwise === 0) return path;
  return mapPath(path, (p) => rotatePoint(p, center, degreesClockwise));
}

/** Renders a path as SVG `<path>` `d` attribute data, in mm user units. */
export function pathToSvgPath(path: VectorPath): string {
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
 * Renders a path as PDF path-construction operators (moveTo, lineTo, cubic
 * bezier curves, closePath), in points with the y-axis flipped for PDF's
 * bottom-left origin. Does not include the surrounding clip/paint operators
 * — callers compose those.
 */
export function pathToPdfPathOperators(path: VectorPath, pageHeightMm: Mm): PDFOperator[] {
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
