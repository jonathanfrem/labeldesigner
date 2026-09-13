import { newAssetId } from '../lib/id';
import type { Asset } from '../model/types';

/** PLAN §14 risk table: warn above ~5MB rather than silently bloating the project file. */
const WARN_ABOVE_BYTES = 5 * 1024 * 1024;

/** How much bigger than its intrinsic size an uploaded SVG is rasterised at, so it still prints crisply once placed. */
const SVG_RASTER_SCALE = 4;
const SVG_RASTER_MAX_PX = 2000;

export interface AssetUploadResult {
  asset: Asset;
  warning?: string;
}

/**
 * Reads an uploaded PNG/JPEG/SVG file into an `Asset`. SVGs are rasterised
 * once here, not deferred to render time — pdf-lib has no vector SVG
 * embedding, and giving every asset one plain raster form means the fit /
 * crop / effective-DPI math and both renderers only ever deal with one kind
 * of image (see the `Asset` doc comment in model/types.ts).
 */
export async function createAssetFromFile(file: File): Promise<AssetUploadResult> {
  const warning =
    file.size > WARN_ABOVE_BYTES
      ? `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — that will make the saved project slow to load. Consider downscaling it first.`
      : undefined;

  if (file.type === 'image/svg+xml') {
    return { asset: await rasterizeSvgFile(file), warning };
  }
  if (file.type === 'image/png' || file.type === 'image/jpeg') {
    const dataUrl = await readAsDataUrl(file);
    const { width, height } = await decodeImageSize(dataUrl);
    return {
      asset: { id: newAssetId(), mime: file.type, dataUrl, naturalWidthPx: width, naturalHeightPx: height },
      warning,
    };
  }
  throw new Error(`Unsupported image type: ${file.type || file.name}. Use PNG, JPEG or SVG.`);
}

function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });
}

async function decodeImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await decodeImage(dataUrl);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

async function rasterizeSvgFile(file: File): Promise<Asset> {
  const svgDataUrl = await readAsDataUrl(file);
  const img = await decodeImage(svgDataUrl);

  // SVGs with no intrinsic width/height (common for hand-authored icons) decode at 0x0.
  const intrinsicWidth = img.naturalWidth || 300;
  const intrinsicHeight = img.naturalHeight || 300;
  const scale = Math.min(SVG_RASTER_SCALE, SVG_RASTER_MAX_PX / Math.max(intrinsicWidth, intrinsicHeight));
  const width = Math.max(1, Math.round(intrinsicWidth * scale));
  const height = Math.max(1, Math.round(intrinsicHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);

  return { id: newAssetId(), mime: 'image/png', dataUrl: canvas.toDataURL('image/png'), naturalWidthPx: width, naturalHeightPx: height };
}
