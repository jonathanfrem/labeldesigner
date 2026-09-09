import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import type { SheetTemplate, PrinterProfile } from '../../model/types';
import { IDENTITY_PRINTER_PROFILE } from '../../model/types';
import { allSlots, type Rect } from '../../model/geometry';
import { mmToPt, yFlip } from './units';
import { drawRoundedRectOutline, drawEllipseOutline, drawRectOutline } from './shapeOutline';
import { applyProfileToRect } from './sheet';

const CROSSHAIR_ARM_MM = 4;
const RADIUS_GAUGE_VALUES_MM = [2, 3, 4, 5, 6];
const RADIUS_GAUGE_SPACING_MM = 12;
const RULER_TICK_INTERVAL_MM = 1;
/** Must reach the reference length the workbench UI asks the user to measure (Workbench.tsx REFERENCE_LENGTH_MM). */
const RULER_LENGTH_MM = 100;
const RULER_TICK_LONG_MM = 3;
const RULER_TICK_SHORT_MM = 1.5;
const RULER_LABEL_INTERVAL_MM = 10;
const RULER_LABEL_SIZE_PT = 5;
const OUTLINE_COLOR = rgb(0, 0, 0);
const LINE_WIDTH_PT = 0.4;

/**
 * Numeric labels are the only text this diagnostic sheet draws — they're not
 * part of the label document model, so CLAUDE.md's "fontkit is the only
 * source of text measurement" invariant (which guards SVG/PDF parity for
 * user content) doesn't apply here. A standard PDF font is fine.
 */

export interface CalibrationSlotCrosshair {
  col: number;
  row: number;
  /** Slot centre in mm, in document space (before any printer-profile calibration). */
  centerMm: { x: number; y: number };
}

/**
 * Generates a calibration test sheet PDF: a crosshair at each label centre,
 * label outlines with the template's actual corner radius, a 1mm ruler
 * along the top-left, and a corner-radius gauge in the sheet margin.
 *
 * Returns the PDF bytes plus the crosshair centres actually drawn (in mm,
 * pre-calibration document space) so tests and calibration UI don't have to
 * re-derive slot geometry independently.
 */
export async function renderCalibrationSheetPdf(
  template: SheetTemplate,
  profile: PrinterProfile = IDENTITY_PRINTER_PROFILE,
): Promise<{ bytes: Uint8Array; crosshairs: CalibrationSlotCrosshair[] }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([mmToPt(template.pageSize.width), mmToPt(template.pageSize.height)]);
  const pageHeightMm = template.pageSize.height;

  const crosshairs: CalibrationSlotCrosshair[] = [];
  const slots = allSlots(template);
  let i = 0;
  for (let row = 0; row < template.rows; row++) {
    for (let col = 0; col < template.columns; col++) {
      const slot = slots[i++];
      const centerMm = { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 };
      crosshairs.push({ col, row, centerMm });

      const calibratedSlot = applyProfileToRect(slot, profile);
      drawOutline(page, template, calibratedSlot, pageHeightMm);
      drawCrosshair(page, applyProfileToPoint(centerMm, profile), pageHeightMm);
    }
  }

  drawRuler(page, template, pageHeightMm, font);
  drawRadiusGauge(page, template, pageHeightMm);

  return { bytes: await doc.save({ useObjectStreams: false }), crosshairs };
}

function applyProfileToPoint(point: { x: number; y: number }, profile: PrinterProfile) {
  return { x: point.x * profile.scaleX + profile.offsetX, y: point.y * profile.scaleY + profile.offsetY };
}

function drawOutline(page: import('pdf-lib').PDFPage, template: SheetTemplate, rect: Rect, pageHeightMm: number) {
  switch (template.shape) {
    case 'rounded':
      drawRoundedRectOutline(page, rect, template.cornerRadius ?? 0, pageHeightMm);
      break;
    case 'ellipse':
      drawEllipseOutline(page, rect, pageHeightMm);
      break;
    case 'rect':
    default:
      drawRectOutline(page, rect, pageHeightMm);
      break;
  }
}

function drawCrosshair(page: import('pdf-lib').PDFPage, centerMm: { x: number; y: number }, pageHeightMm: number) {
  const cx = mmToPt(centerMm.x);
  const cy = yFlip(centerMm.y, pageHeightMm);
  const armPt = mmToPt(CROSSHAIR_ARM_MM / 2);
  page.drawLine({ start: { x: cx - armPt, y: cy }, end: { x: cx + armPt, y: cy }, thickness: LINE_WIDTH_PT, color: OUTLINE_COLOR });
  page.drawLine({ start: { x: cx, y: cy - armPt }, end: { x: cx, y: cy + armPt }, thickness: LINE_WIDTH_PT, color: OUTLINE_COLOR });
}

function drawRuler(page: import('pdf-lib').PDFPage, template: SheetTemplate, pageHeightMm: number, font: PDFFont) {
  // Top ruler: ticks along y=0, running along x from 0 to RULER_LENGTH_MM, with mm labels every 10mm.
  for (let mm = 0; mm <= RULER_LENGTH_MM; mm += RULER_TICK_INTERVAL_MM) {
    const isLong = mm % RULER_LABEL_INTERVAL_MM === 0;
    const tickLenMm = isLong ? RULER_TICK_LONG_MM : RULER_TICK_SHORT_MM;
    const x = mmToPt(mm);
    const yTop = yFlip(0, pageHeightMm);
    const yBottom = yFlip(tickLenMm, pageHeightMm);
    page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: LINE_WIDTH_PT, color: OUTLINE_COLOR });
    if (isLong) {
      page.drawText(String(mm), {
        x: x + mmToPt(0.5),
        y: yBottom - RULER_LABEL_SIZE_PT,
        size: RULER_LABEL_SIZE_PT,
        font,
        color: OUTLINE_COLOR,
      });
    }
  }

  // Left ruler: ticks along x=0, running along y from 0 to RULER_LENGTH_MM, with mm labels every 10mm.
  for (let mm = 0; mm <= RULER_LENGTH_MM; mm += RULER_TICK_INTERVAL_MM) {
    const isLong = mm % RULER_LABEL_INTERVAL_MM === 0;
    const tickLenMm = isLong ? RULER_TICK_LONG_MM : RULER_TICK_SHORT_MM;
    const y = yFlip(mm, pageHeightMm);
    const xLeft = mmToPt(0);
    const xRight = mmToPt(tickLenMm);
    page.drawLine({ start: { x: xLeft, y }, end: { x: xRight, y }, thickness: LINE_WIDTH_PT, color: OUTLINE_COLOR });
    if (isLong) {
      page.drawText(String(mm), {
        x: xRight + mmToPt(0.5),
        y: y - RULER_LABEL_SIZE_PT / 2,
        size: RULER_LABEL_SIZE_PT,
        font,
        color: OUTLINE_COLOR,
      });
    }
  }

  void template;
}

/** A row of reference circles (2-6mm radius) placed in the bottom margin for comparing against a die-cut corner. */
function drawRadiusGauge(page: import('pdf-lib').PDFPage, template: SheetTemplate, pageHeightMm: number) {
  const gaugeYMm = template.pageSize.height - 10;
  RADIUS_GAUGE_VALUES_MM.forEach((radiusMm, i) => {
    const centerXMm = 10 + i * RADIUS_GAUGE_SPACING_MM;
    page.drawEllipse({
      x: mmToPt(centerXMm),
      y: yFlip(gaugeYMm, pageHeightMm),
      xScale: mmToPt(radiusMm),
      yScale: mmToPt(radiusMm),
      borderColor: OUTLINE_COLOR,
      borderWidth: LINE_WIDTH_PT,
    });
  });
}
