import { rgb, type PDFPage } from 'pdf-lib';
import { pushGraphicsState, popGraphicsState, stroke, setLineWidth } from 'pdf-lib';
import type { Mm } from '../../model/types';
import type { Rect } from '../../model/geometry';
import { mmToPt, yFlip } from './units';
import { roundedRectToPdfPathOperators } from './roundedRect';

const OUTLINE_COLOR = rgb(0, 0, 0);
const OUTLINE_WIDTH_PT = 0.5;

export function drawRectOutline(page: PDFPage, rect: Rect, pageHeightMm: Mm): void {
  page.drawRectangle({
    x: mmToPt(rect.x),
    y: yFlip(rect.y + rect.height, pageHeightMm),
    width: mmToPt(rect.width),
    height: mmToPt(rect.height),
    borderColor: OUTLINE_COLOR,
    borderWidth: OUTLINE_WIDTH_PT,
  });
}

export function drawRoundedRectOutline(page: PDFPage, rect: Rect, radius: Mm, pageHeightMm: Mm): void {
  const pathOps = roundedRectToPdfPathOperators(rect, radius, pageHeightMm);
  page.pushOperators(
    pushGraphicsState(),
    setLineWidth(OUTLINE_WIDTH_PT),
    ...pathOps,
    stroke(),
    popGraphicsState(),
  );
}

export function drawEllipseOutline(page: PDFPage, rect: Rect, pageHeightMm: Mm): void {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  page.drawEllipse({
    x: mmToPt(centerX),
    y: yFlip(centerY, pageHeightMm),
    xScale: mmToPt(rect.width / 2),
    yScale: mmToPt(rect.height / 2),
    borderColor: OUTLINE_COLOR,
    borderWidth: OUTLINE_WIDTH_PT,
  });
}
