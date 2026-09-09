import type { Element, Mm } from './types';
import type { Rect } from './geometry';

export interface SnapGuide {
  orientation: 'v' | 'h';
  /** mm position, in the label's own coordinate space. */
  position: Mm;
}

export interface SnapTargets {
  xs: Mm[];
  ys: Mm[];
}

const SNAP_TOLERANCE_MM = 1.5;

/** Label edges/centre plus every other (non-excluded) element's edges/centre. */
export function collectSnapTargets(labelSize: { width: Mm; height: Mm }, elements: Element[], excludeIds: Set<string>): SnapTargets {
  const xs: Mm[] = [0, labelSize.width / 2, labelSize.width];
  const ys: Mm[] = [0, labelSize.height / 2, labelSize.height];
  for (const el of elements) {
    if (excludeIds.has(el.id)) continue;
    xs.push(el.x, el.x + el.width / 2, el.x + el.width);
    ys.push(el.y, el.y + el.height / 2, el.y + el.height);
  }
  return { xs, ys };
}

/**
 * Snaps a box being dragged (not resized) to the nearest target on each
 * axis independently, trying the box's left/centre/right edge against `xs`
 * and top/centre/bottom against `ys`. Returns the box's own position
 * unchanged on an axis with no match within tolerance.
 */
export function snapBoxPosition(box: Rect, targets: SnapTargets): { x: Mm; y: Mm; guides: SnapGuide[] } {
  const x = snapAxis([box.x, box.x + box.width / 2, box.x + box.width], targets.xs, box.width, box.x);
  const y = snapAxis([box.y, box.y + box.height / 2, box.y + box.height], targets.ys, box.height, box.y);

  const guides: SnapGuide[] = [];
  if (x.guide !== undefined) guides.push({ orientation: 'v', position: x.guide });
  if (y.guide !== undefined) guides.push({ orientation: 'h', position: y.guide });

  return { x: x.value, y: y.value, guides };
}

function snapAxis(
  edges: [Mm, Mm, Mm],
  targets: Mm[],
  size: Mm,
  fallback: Mm,
): { value: Mm; guide?: Mm } {
  const offsets = [0, size / 2, size];
  let best: { dist: Mm; value: Mm; guide: Mm } | undefined;
  for (let i = 0; i < edges.length; i++) {
    for (const t of targets) {
      const dist = Math.abs(edges[i] - t);
      if (dist <= SNAP_TOLERANCE_MM && (!best || dist < best.dist)) {
        best = { dist, value: t - offsets[i], guide: t };
      }
    }
  }
  return best ? { value: best.value, guide: best.guide } : { value: fallback };
}
