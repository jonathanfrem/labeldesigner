import { clip, endPath, fill, popGraphicsState, pushGraphicsState, setFillingColor, type PDFPage } from 'pdf-lib';
import type { LabelDocument, PrinterProfile } from '../../model/types';
import { IDENTITY_PRINTER_PROFILE } from '../../model/types';
import type { Rect } from '../../model/geometry';
import { allSlots } from '../../model/geometry';
import { hexToRgb } from './color';
import { drawElement } from './elements';
import { labelClipToPdfPathOperators } from './labelClip';
import { applyProfileToRect } from './sheet';

/**
 * Draws one label instance — background then elements, in array order —
 * clipped to the template's die-cut shape. `origin` is the label's top-left
 * in sheet mm space; elements are authored relative to the label itself.
 */
export function drawLabelDocument(page: PDFPage, doc: LabelDocument, labelRect: Rect, pageHeightMm: number): void {
  const clipOps = labelClipToPdfPathOperators(doc.template, labelRect, pageHeightMm);

  page.pushOperators(pushGraphicsState(), ...clipOps, clip(), endPath());

  if (doc.background?.fill) {
    const bgOps = labelClipToPdfPathOperators(doc.template, labelRect, pageHeightMm);
    page.pushOperators(setFillingColor(hexToRgb(doc.background.fill)), ...bgOps, fill());
  }

  for (const element of doc.elements) {
    drawElement(page, element, pageHeightMm, { x: labelRect.x, y: labelRect.y });
  }

  page.pushOperators(popGraphicsState());
}

/** Draws the document into every slot of its template's sheet, calibrated. */
export function drawDocumentSheet(
  page: PDFPage,
  doc: LabelDocument,
  pageHeightMm: number,
  profile: PrinterProfile = IDENTITY_PRINTER_PROFILE,
): void {
  for (const slot of allSlots(doc.template)) {
    drawLabelDocument(page, doc, applyProfileToRect(slot, profile), pageHeightMm);
  }
}
