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
  degrees,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib';
import { setFillingColor, setStrokingColor } from 'pdf-lib';
import type { Element, Mm } from '../../model/types';
import type { Rect } from '../../model/geometry';
import { boxCenter, lineEndpoints, rotatePoint } from '../../model/geometry';
import { IDENTITY_PLACEMENT, type Placement } from '../placement';
import { layoutText } from '../../text/layout';
import { hexToRgb } from './color';
import { buildEllipsePath } from './ellipsePath';
import type { EmbeddedFonts } from './fonts';
import { mapPath, pathToPdfPathOperators } from './path';
import { mmToPt, yFlip } from './units';
import { buildRoundedRectPath } from './roundedRect';

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

/**
 * Draws one element. `placement` carries every point from the label's own
 * local/document space (0,0 at the label's top-left, matching
 * `LabelDocument.size`) to where it actually lands — identity for "draw at
 * its own local position" (the parity-check demo), a real slot transform
 * once this is wired into sheet printing. Every element is authored
 * relative to the label, never the page.
 */
export function drawElement(page: PDFPage, element: Element, pageHeightMm: Mm, placement: Placement = IDENTITY_PLACEMENT, fonts?: EmbeddedFonts): void {
  if (!element.visible) return;
  switch (element.type) {
    case 'rect':
      drawRectElement(page, element, pageHeightMm, placement);
      break;
    case 'ellipse':
      drawEllipseElement(page, element, pageHeightMm, placement);
      break;
    case 'line':
      drawLineElement(page, element, pageHeightMm, placement);
      break;
    case 'text':
      if (fonts) drawTextElement(page, element, pageHeightMm, placement, fonts);
      break;
  }
}

function drawRectElement(page: PDFPage, element: Extract<Element, { type: 'rect' }>, pageHeightMm: Mm, placement: Placement): void {
  const localRect: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
  const hasFill = !!element.fill;
  const hasStroke = !!element.stroke && element.strokeWidth > 0;
  if (!hasFill && !hasStroke) return;

  const path = mapPath(buildRoundedRectPath(localRect, element.cornerRadius ?? 0, element.rotation), placement.transform);
  const pathOps = pathToPdfPathOperators(path, pageHeightMm);
  const ops: PDFOperator[] = [pushGraphicsState(), ...opacityOps(page, element.opacity)];
  if (hasFill) ops.push(setFillingColor(hexToRgb(element.fill!)));
  if (hasStroke) ops.push(setStrokingColor(hexToRgb(element.stroke!)), setLineWidth(mmToPt(element.strokeWidth)));
  ops.push(...pathOps, paintOp(hasFill, hasStroke), popGraphicsState());
  page.pushOperators(...ops);
}

function drawEllipseElement(page: PDFPage, element: Extract<Element, { type: 'ellipse' }>, pageHeightMm: Mm, placement: Placement): void {
  const localRect: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
  const hasFill = !!element.fill;
  const hasStroke = !!element.stroke && element.strokeWidth > 0;
  if (!hasFill && !hasStroke) return;

  const path = mapPath(buildEllipsePath(localRect, element.rotation), placement.transform);
  const pathOps = pathToPdfPathOperators(path, pageHeightMm);
  const ops: PDFOperator[] = [pushGraphicsState(), ...opacityOps(page, element.opacity)];
  if (hasFill) ops.push(setFillingColor(hexToRgb(element.fill!)));
  if (hasStroke) ops.push(setStrokingColor(hexToRgb(element.stroke!)), setLineWidth(mmToPt(element.strokeWidth)));
  ops.push(...pathOps, paintOp(hasFill, hasStroke), popGraphicsState());
  page.pushOperators(...ops);
}

function drawLineElement(page: PDFPage, element: Extract<Element, { type: 'line' }>, pageHeightMm: Mm, placement: Placement): void {
  if (element.strokeWidth <= 0) return;
  const localRect: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
  const [p1, p2] = lineEndpoints(localRect, element.rotation).map(placement.transform);
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

/**
 * Draws one glyph per `page.drawText` call at the exact position `layoutText`
 * computed — never a multi-character string, so pdf-lib can't re-shape or
 * re-kern anything itself (CLAUDE.md invariant 4). Position goes through the
 * same point transform (`placement`) as every other element; orientation has
 * no point-list representation to transform, so it's drawn with drawText's
 * own per-glyph `rotate` option — the combined element + placement rotation
 * angle, negated to match PDF's counter-clockwise convention (see the sign
 * derivation in git history / DocumentRenderer.tsx for the SVG equivalent,
 * which needs no such negation since SVG rotation is already clockwise).
 */
function drawTextElement(page: PDFPage, element: Extract<Element, { type: 'text' }>, pageHeightMm: Mm, placement: Placement, fonts: EmbeddedFonts): void {
  const embedded = fonts.get(element.fontId);
  if (!embedded) return;

  const localRect: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
  const layout = layoutText(
    element.content,
    {
      fontSizePt: element.fontSizePt,
      lineHeight: element.lineHeight,
      letterSpacing: element.letterSpacing,
      align: element.align,
      verticalAlign: element.verticalAlign,
      autoShrink: element.autoShrink,
      minFontSizePt: element.minFontSizePt,
    },
    localRect.width,
    localRect.height,
    embedded.layoutFont,
  );

  const elementCenter = boxCenter(localRect);
  const totalAngle = (element.rotation + placement.extraRotationDeg) % 360;
  const color = hexToRgb(element.color);

  for (const line of layout.lines) {
    for (const run of line.runs) {
      const localAnchor = { x: localRect.x + run.x, y: localRect.y + line.baselineY };
      const rotatedByElement = rotatePoint(localAnchor, elementCenter, element.rotation);
      const sheetAnchor = placement.transform(rotatedByElement);
      page.drawText(run.text, {
        x: mmToPt(sheetAnchor.x),
        y: yFlip(sheetAnchor.y, pageHeightMm),
        size: layout.fontSizePt,
        font: embedded.pdfFont,
        color,
        opacity: element.opacity,
        rotate: degrees(-totalAngle),
      });
    }
  }
}
