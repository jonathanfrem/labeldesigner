import type { Element } from './types';
import { rotatedAabb, type Rect } from './geometry';

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'middle-v' | 'bottom';
export type DistributeMode = 'horizontal' | 'vertical';

export interface ElementPatch {
  id: string;
  patch: Partial<Element>;
}

function boxOf(el: Element): Rect {
  return rotatedAabb({ x: el.x, y: el.y, width: el.width, height: el.height }, el.rotation);
}

/**
 * Aligns elements relative to the bounding box of the selection itself (not
 * the label) — the common case of lining several elements up with each
 * other. Moves each element's own (unrotated) x/y by the same delta its
 * rotated bounding box needs, so a rotated element still ends up flush.
 */
export function alignElements(elements: Element[], mode: AlignMode): ElementPatch[] {
  if (elements.length < 2) return [];
  const boxes = elements.map(boxOf);
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));

  return elements.map((el, i) => {
    const box = boxes[i];
    switch (mode) {
      case 'left':
        return { id: el.id, patch: { x: el.x + (minX - box.x) } };
      case 'right':
        return { id: el.id, patch: { x: el.x + (maxX - (box.x + box.width)) } };
      case 'center-h':
        return { id: el.id, patch: { x: el.x + ((minX + maxX) / 2 - (box.x + box.width / 2)) } };
      case 'top':
        return { id: el.id, patch: { y: el.y + (minY - box.y) } };
      case 'bottom':
        return { id: el.id, patch: { y: el.y + (maxY - (box.y + box.height)) } };
      case 'middle-v':
        return { id: el.id, patch: { y: el.y + ((minY + maxY) / 2 - (box.y + box.height / 2)) } };
    }
  });
}

/** Spaces element centres evenly between the two extreme elements on the given axis; the extremes don't move. */
export function distributeElements(elements: Element[], mode: DistributeMode): ElementPatch[] {
  if (elements.length < 3) return [];
  const axis = mode === 'horizontal' ? 'x' : 'y';
  const withBoxes = elements.map((el) => ({ el, box: boxOf(el) }));
  const centerOf = (box: Rect) => (axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2);

  const sorted = [...withBoxes].sort((a, b) => centerOf(a.box) - centerOf(b.box));
  const firstCenter = centerOf(sorted[0].box);
  const lastCenter = centerOf(sorted[sorted.length - 1].box);
  const step = (lastCenter - firstCenter) / (sorted.length - 1);

  const patches: ElementPatch[] = [];
  sorted.forEach(({ el, box }, i) => {
    if (i === 0 || i === sorted.length - 1) return;
    const targetCenter = firstCenter + step * i;
    const delta = targetCenter - centerOf(box);
    patches.push({ id: el.id, patch: axis === 'x' ? { x: el.x + delta } : { y: el.y + delta } });
  });
  return patches;
}
