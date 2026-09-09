import type { PDFOperator } from 'pdf-lib';
import type { Rect } from '../../model/geometry';
import type { SheetTemplate } from '../../model/types';
import { buildEllipsePath } from './ellipsePath';
import { pathToPdfPathOperators, pathToSvgPath, type VectorPath } from './path';
import { buildRoundedRectPath } from './roundedRect';

/**
 * The die-cut path a label's whole rendered content — background and every
 * element, including anything an element overhangs past the edge — is
 * clipped to. One path builder per template shape, shared by both
 * renderers, so a rounded or elliptical die-cut can't clip differently on
 * screen than it does in print.
 */
export function buildLabelClipPath(template: SheetTemplate, rect: Rect): VectorPath {
  switch (template.shape) {
    case 'rounded':
      return buildRoundedRectPath(rect, template.cornerRadius ?? 0);
    case 'ellipse':
      return buildEllipsePath(rect);
    case 'rect':
    default:
      return buildRoundedRectPath(rect, 0);
  }
}

export function labelClipToSvgPath(template: SheetTemplate, rect: Rect): string {
  return pathToSvgPath(buildLabelClipPath(template, rect));
}

export function labelClipToPdfPathOperators(template: SheetTemplate, rect: Rect, pageHeightMm: number): PDFOperator[] {
  return pathToPdfPathOperators(buildLabelClipPath(template, rect), pageHeightMm);
}
