import type { LabelDocument } from '../model/types';
import type { Point, Rect } from '../model/geometry';
import { placeInSlot } from '../model/geometry';

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
