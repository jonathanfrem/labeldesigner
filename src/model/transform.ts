import type { Point, Rect } from './geometry';
import { rotatePoint } from './geometry';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const ALL_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface HandleSides {
  moveLeft: boolean;
  moveRight: boolean;
  moveTop: boolean;
  moveBottom: boolean;
}

const HANDLE_SIDES: Record<HandleId, HandleSides> = {
  nw: { moveLeft: true, moveRight: false, moveTop: true, moveBottom: false },
  n: { moveLeft: false, moveRight: false, moveTop: true, moveBottom: false },
  ne: { moveLeft: false, moveRight: true, moveTop: true, moveBottom: false },
  e: { moveLeft: false, moveRight: true, moveTop: false, moveBottom: false },
  se: { moveLeft: false, moveRight: true, moveTop: false, moveBottom: true },
  s: { moveLeft: false, moveRight: false, moveTop: false, moveBottom: true },
  sw: { moveLeft: true, moveRight: false, moveTop: false, moveBottom: true },
  w: { moveLeft: true, moveRight: false, moveTop: false, moveBottom: false },
};

/** A line element has no useful vertical extent — its top/bottom handles would do nothing. */
export function handlesForElementType(type: 'rect' | 'ellipse' | 'line' | 'text'): HandleId[] {
  return type === 'line' ? ['w', 'e'] : ALL_HANDLES;
}

const MIN_SIZE_MM = 1;

function rotateVector(v: Point, degreesClockwise: number): Point {
  return rotatePoint(v, { x: 0, y: 0 }, degreesClockwise);
}

export interface ResizeInput {
  /** The box as it was when the drag started — always resize from this, never the previous frame's box, or error accumulates. */
  box: Rect;
  rotation: number;
  handle: HandleId;
  pointerCurrent: Point;
  /** Shift: keep the box's original aspect ratio (only meaningful when both axes are free to move, i.e. a corner handle). */
  aspectLocked: boolean;
  /** Alt: resize about the box centre instead of the opposite edge/corner. */
  aboutCenter: boolean;
}

/**
 * Resizes a possibly-rotated box by dragging one handle, keeping the
 * opposite edge/corner fixed in world space (or the centre, under Alt).
 * Works by moving into the box's own unrotated local frame — anchored at
 * the fixed point — so the rotation itself never needs to change.
 */
export function resizeBox(input: ResizeInput): Rect {
  const { box, rotation, handle, pointerCurrent, aspectLocked, aboutCenter } = input;
  const sides = HANDLE_SIDES[handle];
  const center: Point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  const anchorLocal: Point = aboutCenter
    ? center
    : {
        x: sides.moveLeft ? box.x + box.width : box.x,
        y: sides.moveTop ? box.y + box.height : box.y,
      };
  const anchorWorld: Point = aboutCenter ? center : rotatePoint(anchorLocal, center, rotation);

  const worldDelta: Point = { x: pointerCurrent.x - anchorWorld.x, y: pointerCurrent.y - anchorWorld.y };
  const localDelta = rotateVector(worldDelta, -rotation);

  let newWidth = box.width;
  let newHeight = box.height;

  if (aboutCenter) {
    if (sides.moveLeft || sides.moveRight) newWidth = Math.max(MIN_SIZE_MM, Math.abs(localDelta.x) * 2);
    if (sides.moveTop || sides.moveBottom) newHeight = Math.max(MIN_SIZE_MM, Math.abs(localDelta.y) * 2);
  } else {
    if (sides.moveRight) newWidth = Math.max(MIN_SIZE_MM, localDelta.x);
    if (sides.moveLeft) newWidth = Math.max(MIN_SIZE_MM, -localDelta.x);
    if (sides.moveBottom) newHeight = Math.max(MIN_SIZE_MM, localDelta.y);
    if (sides.moveTop) newHeight = Math.max(MIN_SIZE_MM, -localDelta.y);
  }

  const isCornerHandle = (sides.moveLeft || sides.moveRight) && (sides.moveTop || sides.moveBottom);
  if (aspectLocked && isCornerHandle && box.width > 0 && box.height > 0) {
    const scale = Math.max(newWidth / box.width, newHeight / box.height);
    newWidth = Math.max(MIN_SIZE_MM, box.width * scale);
    newHeight = Math.max(MIN_SIZE_MM, box.height * scale);
  }

  if (aboutCenter) {
    return { x: center.x - newWidth / 2, y: center.y - newHeight / 2, width: newWidth, height: newHeight };
  }

  const newLocalX = sides.moveLeft ? anchorLocal.x - newWidth : anchorLocal.x;
  const newLocalY = sides.moveTop ? anchorLocal.y - newHeight : anchorLocal.y;
  const newLocalCenter: Point = { x: newLocalX + newWidth / 2, y: newLocalY + newHeight / 2 };
  const offsetFromAnchor: Point = { x: newLocalCenter.x - anchorLocal.x, y: newLocalCenter.y - anchorLocal.y };
  const rotatedOffset = rotateVector(offsetFromAnchor, rotation);
  const newWorldCenter: Point = { x: anchorWorld.x + rotatedOffset.x, y: anchorWorld.y + rotatedOffset.y };

  return {
    x: newWorldCenter.x - newWidth / 2,
    y: newWorldCenter.y - newHeight / 2,
    width: newWidth,
    height: newHeight,
  };
}

const ROTATION_SNAP_STEP_DEG = 15;

/** Degrees clockwise from box centre to `pointer`, with the rest angle (pointer straight up) mapped to 0. */
export function rotationFromPointer(center: Point, pointer: Point, snapToStep: boolean): number {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  deg = ((deg % 360) + 360) % 360;
  if (snapToStep) deg = Math.round(deg / ROTATION_SNAP_STEP_DEG) * ROTATION_SNAP_STEP_DEG;
  return deg;
}
