import {
  fill,
  fillAndStroke,
  moveTo,
  lineTo,
  popGraphicsState,
  pushGraphicsState,
  setGraphicsState,
  setLineWidth,
  stroke,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib';
import { setFillingColor, setStrokingColor } from 'pdf-lib';
import type { Element, Mm } from '../../model/types';
import type { Point, Rect } from '../../model/geometry';
import { lineEndpoints } from '../../model/geometry';
import { hexToRgb } from './color';
import { ellipseToPdfPathOperators } from './ellipsePath';
import { mmToPt, yFlip } from './units';
import { roundedRectToPdfPathOperators } from './roundedRect';

/**
 * Wraps operators in an ExtGState alpha resource when opacity is partial.
 * Mirrors what pdf-lib's own drawX() options do internally for `opacity` —
 * built by hand here because the rounded/ellipse paths are drawn as custom
 * operators pdf-lib's draw methods can't produce.
 */
function opacityOps(page: PDFPage, opacity: number): PDFOperator[] {
  if (opacity >= 1) return [];
  const graphicsState = page.doc.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity });
  const key = page.node.newExtGState('GS', graphicsState);
  return [setGraphicsState(key)];
}

function paintOp(hasFill: boolean, hasStroke: boolean): PDFOperator {
  if (hasFill && hasStroke) return fillAndStroke();
  if (hasFill) return fill();
  return stroke();
}

const ORIGIN: Point = { x: 0, y: 0 };

/**
 * Draws one element. `origin` shifts it from the label's own coordinate
 * space (0,0 at the label's top-left, matching `LabelDocument.size`) into
 * the sheet — every element is authored relative to the label, not the page.
 */
export function drawElement(page: PDFPage, element: Element, pageHeightMm: Mm, origin: Point = ORIGIN): void {
  if (!element.visible) return;
  switch (element.type) {
    case 'rect':
      drawRectElement(page, element, pageHeightMm, origin);
      break;
    case 'ellipse':
      drawEllipseElement(page, element, pageHeightMm, origin);
      break;
    case 'line':
      drawLineElement(page, element, pageHeightMm, origin);
      break;
  }
}

function drawRectElement(
  page: PDFPage,
  element: Extract<Element, { type: 'rect' }>,
  pageHeightMm: Mm,
  origin: Point,
): void {
  const rect: Rect = { x: element.x + origin.x, y: element.y + origin.y, width: element.width, height: element.height };
  const hasFill = !!element.fill;
  const hasStroke = !!element.stroke && element.strokeWidth > 0;
  if (!hasFill && !hasStroke) return;

  const pathOps = roundedRectToPdfPathOperators(rect, element.cornerRadius ?? 0, pageHeightMm, element.rotation);
  const ops: PDFOperator[] = [pushGraphicsState(), ...opacityOps(page, element.opacity)];
  if (hasFill) ops.push(setFillingColor(hexToRgb(element.fill!)));
  if (hasStroke) ops.push(setStrokingColor(hexToRgb(element.stroke!)), setLineWidth(mmToPt(element.strokeWidth)));
  ops.push(...pathOps, paintOp(hasFill, hasStroke), popGraphicsState());
  page.pushOperators(...ops);
}

function drawEllipseElement(
  page: PDFPage,
  element: Extract<Element, { type: 'ellipse' }>,
  pageHeightMm: Mm,
  origin: Point,
): void {
  const rect: Rect = { x: element.x + origin.x, y: element.y + origin.y, width: element.width, height: element.height };
  const hasFill = !!element.fill;
  const hasStroke = !!element.stroke && element.strokeWidth > 0;
  if (!hasFill && !hasStroke) return;

  const pathOps = ellipseToPdfPathOperators(rect, pageHeightMm, element.rotation);
  const ops: PDFOperator[] = [pushGraphicsState(), ...opacityOps(page, element.opacity)];
  if (hasFill) ops.push(setFillingColor(hexToRgb(element.fill!)));
  if (hasStroke) ops.push(setStrokingColor(hexToRgb(element.stroke!)), setLineWidth(mmToPt(element.strokeWidth)));
  ops.push(...pathOps, paintOp(hasFill, hasStroke), popGraphicsState());
  page.pushOperators(...ops);
}

function drawLineElement(
  page: PDFPage,
  element: Extract<Element, { type: 'line' }>,
  pageHeightMm: Mm,
  origin: Point,
): void {
  if (element.strokeWidth <= 0) return;
  const rect: Rect = { x: element.x + origin.x, y: element.y + origin.y, width: element.width, height: element.height };
  const [p1, p2] = lineEndpoints(rect, element.rotation);
  const a = { x: mmToPt(p1.x), y: yFlip(p1.y, pageHeightMm) };
  const b = { x: mmToPt(p2.x), y: yFlip(p2.y, pageHeightMm) };

  page.pushOperators(
    pushGraphicsState(),
    ...opacityOps(page, element.opacity),
    setStrokingColor(hexToRgb(element.stroke)),
    setLineWidth(mmToPt(element.strokeWidth)),
    moveTo(a.x, a.y),
    lineTo(b.x, b.y),
    stroke(),
    popGraphicsState(),
  );
}
