import { clip, endPath, fill, popGraphicsState, pushGraphicsState, setFillingColor, type PDFPage } from 'pdf-lib';
import type { LabelDocument, PrinterProfile } from '../../model/types';
import { IDENTITY_PRINTER_PROFILE } from '../../model/types';
import type { Rect } from '../../model/geometry';
import { allSlots } from '../../model/geometry';
import { slotPlacement } from '../placement';
import { hexToRgb } from './color';
import { drawElement } from './elements';
import { embedFontsForElements, type EmbeddedFonts } from './fonts';
import { buildLabelClipPath } from './labelClip';
import { mapPath, pathToPdfPathOperators } from './path';
import { applyProfileToRect } from './sheet';

/**
 * Draws one label instance — background then elements, in array order —
 * clipped to the template's die-cut shape. `slotRect` is the label's
 * physical slot on the sheet (the die-cut, at the template's true
 * dimensions); the document's own content — authored at `doc.size`, swapped
 * from the template when `doc.contentRotation` is 90/270 — is placed into
 * it via `slotPlacement` (rotate about the document's own centre, then
 * translate that centre onto the slot's centre; see model/geometry.ts
 * `placeInSlot`). `fonts` must already be embedded (see
 * `embedFontsForElements`) — embedding is async and per-document, not
 * per-slot, so callers do it once upfront.
 */
export function drawLabelDocument(page: PDFPage, doc: LabelDocument, slotRect: Rect, pageHeightMm: number, fonts: EmbeddedFonts = new Map()): void {
  const placement = slotPlacement(doc, slotRect);
  const localRect: Rect = { x: 0, y: 0, width: doc.size.width, height: doc.size.height };
  const clipPath = mapPath(buildLabelClipPath(doc.template, localRect), placement.transform);
  const clipOps = pathToPdfPathOperators(clipPath, pageHeightMm);

  page.pushOperators(pushGraphicsState(), ...clipOps, clip(), endPath());

  if (doc.background?.fill) {
    page.pushOperators(setFillingColor(hexToRgb(doc.background.fill)), ...pathToPdfPathOperators(clipPath, pageHeightMm), fill());
  }

  for (const element of doc.elements) {
    drawElement(page, element, pageHeightMm, placement, fonts);
  }

  page.pushOperators(popGraphicsState());
}

/** Draws the document into every slot of its template's sheet, calibrated. */
export async function drawDocumentSheet(
  page: PDFPage,
  doc: LabelDocument,
  pageHeightMm: number,
  profile: PrinterProfile = IDENTITY_PRINTER_PROFILE,
): Promise<void> {
  const fonts = await embedFontsForElements(page.doc, doc.elements);
  for (const slot of allSlots(doc.template)) {
    drawLabelDocument(page, doc, applyProfileToRect(slot, profile), pageHeightMm, fonts);
  }
}
