import type { Rect } from '../model/geometry';
import type { ImageCrop, ImageFit, Mm } from '../model/types';

/** Below this, a placed image visibly softens on a consumer laser/inkjet printer. */
export const MIN_EFFECTIVE_DPI = 150;

export interface ImagePlacementInput {
  naturalWidthPx: number;
  naturalHeightPx: number;
  crop: ImageCrop;
  fit: ImageFit;
  boxWidthMm: Mm;
  boxHeightMm: Mm;
}

export interface ImagePlacement {
  /**
   * Where the FULL, uncropped source image would be drawn, in mm relative
   * to the element box's own top-left (0,0) — extends beyond the box for
   * 'cover' (and whenever the crop excludes part of the source), sits
   * smaller than the box for 'contain'. Both renderers clip to the box, so
   * drawing the image at this rect and letting it overflow is exactly
   * equivalent to drawing just the visible crop.
   */
  fullImageRect: Rect;
  /** The smaller of the two axis DPIs — what MIN_EFFECTIVE_DPI is compared against. */
  effectiveDpi: number;
  dpiTooLow: boolean;
}

/**
 * Computes where a cropped, fitted image lands in its element's box, and
 * the resulting print resolution. Pure geometry, shared by both renderers —
 * same "compute once, draw twice" shape as text and barcode layout.
 */
export function layoutImage(input: ImagePlacementInput): ImagePlacement {
  const cropPx = {
    x: input.crop.x * input.naturalWidthPx,
    y: input.crop.y * input.naturalHeightPx,
    w: Math.max(1, input.crop.w * input.naturalWidthPx),
    h: Math.max(1, input.crop.h * input.naturalHeightPx),
  };
  const croppedAspect = cropPx.w / cropPx.h;
  const boxAspect = input.boxWidthMm / input.boxHeightMm;

  let drawnWidthMm: Mm;
  let drawnHeightMm: Mm;
  if (input.fit === 'fill') {
    drawnWidthMm = input.boxWidthMm;
    drawnHeightMm = input.boxHeightMm;
  } else {
    // 'contain' matches the box on whichever axis would otherwise overflow it;
    // 'cover' matches the box on the other axis, so the image overflows (and gets clipped) instead.
    const wider = croppedAspect > boxAspect;
    const widthConstrained = input.fit === 'contain' ? wider : !wider;
    if (widthConstrained) {
      drawnWidthMm = input.boxWidthMm;
      drawnHeightMm = input.boxWidthMm / croppedAspect;
    } else {
      drawnHeightMm = input.boxHeightMm;
      drawnWidthMm = input.boxHeightMm * croppedAspect;
    }
  }

  const drawnX = (input.boxWidthMm - drawnWidthMm) / 2;
  const drawnY = (input.boxHeightMm - drawnHeightMm) / 2;

  const scaleX = drawnWidthMm / cropPx.w;
  const scaleY = drawnHeightMm / cropPx.h;

  const fullImageRect: Rect = {
    x: drawnX - cropPx.x * scaleX,
    y: drawnY - cropPx.y * scaleY,
    width: input.naturalWidthPx * scaleX,
    height: input.naturalHeightPx * scaleY,
  };

  const dpiX = cropPx.w / (drawnWidthMm / 25.4);
  const dpiY = cropPx.h / (drawnHeightMm / 25.4);
  const effectiveDpi = Math.min(dpiX, dpiY);

  return { fullImageRect, effectiveDpi, dpiTooLow: effectiveDpi < MIN_EFFECTIVE_DPI };
}
