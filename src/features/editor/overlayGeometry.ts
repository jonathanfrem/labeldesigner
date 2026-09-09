import type { Rect } from '../../model/geometry';
import type { SheetTemplate } from '../../model/types';
import { buildEllipsePath } from '../../render/pdf/ellipsePath';
import { pathToSvgPath } from '../../render/pdf/path';
import { buildRoundedRectPath } from '../../render/pdf/roundedRect';

/** Consumer laser/inkjet printers commonly can't print within this of the paper edge. */
export const DEFAULT_UNPRINTABLE_MARGIN_MM = 5;
export const DEFAULT_BLEED_MM = 1;

/**
 * The safe-area boundary: the label rect inset by the unprintable margin,
 * with corners inset further so the safe region narrows along the die-cut
 * arc rather than staying a uniform rectangular inset (PLAN §4.2) — a
 * shape's own corner radius, reduced by the same margin, does this
 * automatically since it's built with the same path module as the die-cut.
 */
export function safeAreaSvgPath(template: SheetTemplate, labelRect: Rect, marginMm: number): string {
  const inset: Rect = {
    x: labelRect.x + marginMm,
    y: labelRect.y + marginMm,
    width: Math.max(0, labelRect.width - marginMm * 2),
    height: Math.max(0, labelRect.height - marginMm * 2),
  };
  if (template.shape === 'ellipse') return pathToSvgPath(buildEllipsePath(inset));
  const radius = template.shape === 'rounded' ? Math.max(0, (template.cornerRadius ?? 0) - marginMm) : 0;
  return pathToSvgPath(buildRoundedRectPath(inset, radius));
}

/** A visual bleed indicator: the die-cut shape expanded outward by `marginMm`. Not a persisted document field yet. */
export function bleedSvgPath(template: SheetTemplate, labelRect: Rect, marginMm: number): string {
  const expanded: Rect = {
    x: labelRect.x - marginMm,
    y: labelRect.y - marginMm,
    width: labelRect.width + marginMm * 2,
    height: labelRect.height + marginMm * 2,
  };
  if (template.shape === 'ellipse') return pathToSvgPath(buildEllipsePath(expanded));
  const radius = template.shape === 'rounded' ? (template.cornerRadius ?? 0) + marginMm : 0;
  return pathToSvgPath(buildRoundedRectPath(expanded, radius));
}
