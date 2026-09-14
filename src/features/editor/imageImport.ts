import type { Asset, Element } from '../../model/types';
import { newElementId } from '../../lib/id';

export const DEFAULT_IMAGE_WIDTH_MM = 30;

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);

export function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.has(file.type);
}

/** `center`, if given, places the element centered there (e.g. a drop point) instead of the default top-left offset. */
export function newImageElement(asset: Asset, center?: { x: number; y: number }): Element {
  const aspect = asset.naturalWidthPx / asset.naturalHeightPx || 1;
  const width = DEFAULT_IMAGE_WIDTH_MM;
  const height = DEFAULT_IMAGE_WIDTH_MM / aspect;
  return {
    id: newElementId(),
    name: 'Image',
    x: center ? center.x - width / 2 : 10,
    y: center ? center.y - height / 2 : 10,
    width,
    height,
    rotation: 0,
    locked: false,
    visible: true,
    opacity: 1,
    type: 'image',
    assetId: asset.id,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    fit: 'contain',
  };
}
