import {
  clip,
  endPath,
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
import { boxCenter, lineEndpoints } from '../../model/geometry';
import { IDENTITY_PLACEMENT, withElementRotation, type Placement } from '../placement';
import { DEFAULT_HRI_FONT_ID, DEFAULT_HRI_FONT_SIZE_PT, hriBandHeightMm } from '../../barcode/hri';
import { layoutBarcode } from '../../barcode/layout';
import { layoutImage } from '../../image/layout';
import { layoutText } from '../../text/layout';
import { hexToRgb } from './color';
import { buildEllipsePath } from './ellipsePath';
import type { EmbeddedFonts } from './fonts';
import type { EmbeddedImages } from './images';
import { mapPath, pathsToPdfPathOperators, pathToPdfPathOperators, polygonToPath } from './path';
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
export function drawElement(
  page: PDFPage,
  element: Element,
  pageHeightMm: Mm,
  placement: Placement = IDENTITY_PLACEMENT,
  fonts?: EmbeddedFonts,
  images?: EmbeddedImages,
): void {
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
    case 'barcode':
      drawBarcodeElement(page, element, pageHeightMm, placement, fonts);
      break;
    case 'image':
      if (images) drawImageElement(page, element, pageHeightMm, placement, images);
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
  const toSheet = withElementRotation(placement, elementCenter, element.rotation);
  const color = hexToRgb(element.color);

  for (const line of layout.lines) {
    for (const run of line.runs) {
      const sheetAnchor = toSheet({ x: localRect.x + run.x, y: localRect.y + line.baselineY });
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

/**
 * Bars (Code 128) and merged module polygons (QR) come out of
 * `layoutBarcode` in local mm space, relative to the bars' own box — never
 * rasterised (CLAUDE.md invariant 5). They go through the same
 * point-transform pipeline as rect/ellipse; the optional HRI line is a
 * normal text run through the text-layout module, drawn exactly like
 * `drawTextElement`, not something bwip-js draws.
 */
function drawBarcodeElement(page: PDFPage, element: Extract<Element, { type: 'barcode' }>, pageHeightMm: Mm, placement: Placement, fonts?: EmbeddedFonts): void {
  const localRect: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
  const showHri = element.showText && element.symbology === 'code128';
  const hriFontSizePt = element.hriFontSizePt ?? DEFAULT_HRI_FONT_SIZE_PT;
  const hriHeight = showHri ? hriBandHeightMm(hriFontSizePt) : 0;
  const barsRect: Rect = { x: localRect.x, y: localRect.y, width: localRect.width, height: Math.max(1, localRect.height - hriHeight) };

  const geometry = layoutBarcode({
    symbology: element.symbology,
    value: element.value,
    widthMm: barsRect.width,
    heightMm: barsRect.height,
    quietZoneModules: element.quietZoneModules,
    errorCorrection: element.errorCorrection,
  });

  const elementCenter = boxCenter(localRect);
  const toSheet = withElementRotation(placement, elementCenter, element.rotation);
  const color = hexToRgb(element.color);

  const ops: PDFOperator[] = [pushGraphicsState(), ...opacityOps(page, element.opacity), setFillingColor(color)];

  for (const bar of geometry.bars) {
    const abs: Rect = { x: bar.x + barsRect.x, y: bar.y + barsRect.y, width: bar.width, height: bar.height };
    const path = mapPath(buildRoundedRectPath(abs, 0, 0), toSheet);
    ops.push(...pathToPdfPathOperators(path, pageHeightMm), fill());
  }
  for (const batch of geometry.polygonBatches) {
    const paths = batch.map((poly) => mapPath(polygonToPath(poly.map((p) => ({ x: p.x + barsRect.x, y: p.y + barsRect.y }))), toSheet));
    ops.push(...pathsToPdfPathOperators(paths, pageHeightMm), fill());
  }
  ops.push(popGraphicsState());
  page.pushOperators(...ops);

  const embedded = showHri ? fonts?.get(element.hriFontId ?? DEFAULT_HRI_FONT_ID) : undefined;
  if (embedded) {
    const hriRect: Rect = { x: localRect.x, y: localRect.y + barsRect.height, width: localRect.width, height: hriHeight };
    const layout = layoutText(
      element.value,
      { fontSizePt: hriFontSizePt, lineHeight: 1, letterSpacing: 0, align: 'center', verticalAlign: 'top', autoShrink: false },
      hriRect.width,
      hriRect.height,
      embedded.layoutFont,
    );
    const totalAngle = (element.rotation + placement.extraRotationDeg) % 360;
    for (const line of layout.lines) {
      for (const run of line.runs) {
        const sheetAnchor = toSheet({ x: hriRect.x + run.x, y: hriRect.y + line.baselineY });
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
}

/**
 * The one element type that's genuinely raster (CLAUDE.md invariant 5 is
 * about barcodes, not images). Crop and fit are pure geometry (`layoutImage`,
 * identical math on both renderers): the full uncropped bitmap is drawn at a
 * rect that may extend past the element box, clipped to the box exactly like
 * a rect element's own fill would be. Rotation has no point-list
 * representation to give a bitmap, so — like text — it's drawn with
 * `drawImage`'s own `rotate` option around the image's already-placed
 * bottom-left corner (PDF's coordinate convention for that option), negated
 * to match PDF's counter-clockwise convention same as text.
 */
function drawImageElement(page: PDFPage, element: Extract<Element, { type: 'image' }>, pageHeightMm: Mm, placement: Placement, images: EmbeddedImages): void {
  const embedded = images.get(element.assetId);
  if (!embedded) return;

  const localRect: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
  const { fullImageRect } = layoutImage({
    naturalWidthPx: embedded.width,
    naturalHeightPx: embedded.height,
    crop: element.crop,
    fit: element.fit,
    boxWidthMm: localRect.width,
    boxHeightMm: localRect.height,
  });
  const absImageRect: Rect = {
    x: fullImageRect.x + localRect.x,
    y: fullImageRect.y + localRect.y,
    width: fullImageRect.width,
    height: fullImageRect.height,
  };

  const elementCenter = boxCenter(localRect);
  const toSheet = withElementRotation(placement, elementCenter, element.rotation);
  const totalAngle = (element.rotation + placement.extraRotationDeg) % 360;
  const bottomLeft = toSheet({ x: absImageRect.x, y: absImageRect.y + absImageRect.height });

  const clipPath = mapPath(buildRoundedRectPath(localRect, 0, element.rotation), placement.transform);

  page.pushOperators(pushGraphicsState(), ...pathToPdfPathOperators(clipPath, pageHeightMm), clip(), endPath());
  page.drawImage(embedded, {
    x: mmToPt(bottomLeft.x),
    y: yFlip(bottomLeft.y, pageHeightMm),
    width: mmToPt(absImageRect.width),
    height: mmToPt(absImageRect.height),
    rotate: degrees(-totalAngle),
    opacity: element.opacity,
  });
  page.pushOperators(popGraphicsState());
}
