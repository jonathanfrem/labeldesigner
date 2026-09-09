import { PDFDocument } from 'pdf-lib';
import type { SheetTemplate, PrinterProfile } from '../../model/types';
import { IDENTITY_PRINTER_PROFILE } from '../../model/types';
import { allSlots } from '../../model/geometry';
import { mmToPt } from './units';
import { drawRoundedRectOutline, drawEllipseOutline, drawRectOutline } from './shapeOutline';

/** Renders an A4 sheet with every label slot's outline drawn, empty otherwise. */
export async function renderEmptySheetPdf(
  template: SheetTemplate,
  profile: PrinterProfile = IDENTITY_PRINTER_PROFILE,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([mmToPt(template.pageSize.width), mmToPt(template.pageSize.height)]);
  const pageHeightMm = template.pageSize.height;

  for (const slot of allSlots(template)) {
    const calibrated = applyProfileToRect(slot, profile);
    switch (template.shape) {
      case 'rounded':
        drawRoundedRectOutline(page, calibrated, template.cornerRadius ?? 0, pageHeightMm);
        break;
      case 'ellipse':
        drawEllipseOutline(page, calibrated, pageHeightMm);
        break;
      case 'rect':
      default:
        drawRectOutline(page, calibrated, pageHeightMm);
        break;
    }
  }

  return doc.save({ useObjectStreams: false });
}

/** Applies a printer profile's offset and scale to a slot rect, in mm. Scaling is about the page origin. */
export function applyProfileToRect(
  rect: { x: number; y: number; width: number; height: number },
  profile: PrinterProfile,
): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x * profile.scaleX + profile.offsetX,
    y: rect.y * profile.scaleY + profile.offsetY,
    width: rect.width * profile.scaleX,
    height: rect.height * profile.scaleY,
  };
}

