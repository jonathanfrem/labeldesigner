import type { LabelDocument } from '../model/types';
import type { Point, Rect } from '../model/geometry';
import { placeInSlot, rotatePoint } from '../model/geometry';

export type PointTransform = (p: Point) => Point;

/**
 * How a document's local/document-space geometry maps onto what actually
 * gets drawn, shared by both renderers. `transform` carries every shape's
 * points from local space to their final position (element rotation
 * composed with sheet placement, if any) — always literal point math, never
 * a renderer-native transform. `extraRotationDeg` is the one thing that
 * math can't capture: a text glyph's own visual orientation, which is added
 * to that element's own rotation when drawing each glyph. It's 0 for the
 * editor (no placement rotation applies there) and equals `contentRotation`
 * when placing onto a sheet slot.
 */
export interface Placement {
  transform: PointTransform;
  extraRotationDeg: number;
}

/** The editor renders a document in its own local frame, unaware of sheet placement. */
export const IDENTITY_PLACEMENT: Placement = { transform: (p) => p, extraRotationDeg: 0 };

/** Builds the placement for drawing `document` into a specific sheet slot — see `placeInSlot`. */
export function slotPlacement(document: LabelDocument, slotRect: Rect): Placement {
  return {
    transform: (p) => placeInSlot(p, { documentSize: document.size, contentRotation: document.contentRotation, slotRect }),
    extraRotationDeg: document.contentRotation,
  };
}

/**
 * Combines an element's own rotation (about its own centre, in local space)
 * with the placement's sheet transform, into one point function — the same
 * composition every element type applies, whether it draws a path (rect,
 * ellipse, barcode bars/modules) or positions a text glyph anchor.
 */
export function withElementRotation(placement: Placement, center: Point, elementRotationDeg: number): PointTransform {
  return (p) => placement.transform(rotatePoint(p, center, elementRotationDeg));
}
