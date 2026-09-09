import type { Element, LabelDocument } from '../../model/types';
import type { Rect } from '../../model/geometry';
import { lineEndpoints } from '../../model/geometry';
import { ellipseToSvgPath } from '../pdf/ellipsePath';
import { labelClipToSvgPath } from '../pdf/labelClip';
import { roundedRectToSvgPath } from '../pdf/roundedRect';

export interface DocumentRendererProps {
  document: LabelDocument;
  /** Top-left of the label in the parent SVG's mm coordinate space. */
  origin: { x: number; y: number };
  clipId: string;
}

/**
 * Renders one label instance — background then elements, in array order —
 * clipped to the template's die-cut shape. Mirrors `drawLabelDocument` in
 * render/pdf/document.ts exactly: same clip path builder, same per-element
 * path builders, same paint order.
 */
export function DocumentRenderer({ document, origin, clipId }: DocumentRendererProps) {
  const labelRect: Rect = {
    x: origin.x,
    y: origin.y,
    width: document.template.labelWidth,
    height: document.template.labelHeight,
  };
  const clipPath = labelClipToSvgPath(document.template, labelRect);

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={clipPath} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {document.background?.fill && <path d={clipPath} fill={document.background.fill} />}
        {document.elements.map((element) => (
          <ElementShape key={element.id} element={element} origin={origin} />
        ))}
      </g>
    </>
  );
}

function ElementShape({ element, origin }: { element: Element; origin: { x: number; y: number } }) {
  if (!element.visible) return null;
  const rect: Rect = { x: element.x + origin.x, y: element.y + origin.y, width: element.width, height: element.height };

  switch (element.type) {
    case 'rect': {
      const d = roundedRectToSvgPath(rect, element.cornerRadius ?? 0, element.rotation);
      return (
        <path
          d={d}
          fill={element.fill ?? 'none'}
          stroke={element.stroke ?? 'none'}
          strokeWidth={element.strokeWidth}
          opacity={element.opacity}
        />
      );
    }
    case 'ellipse': {
      const d = ellipseToSvgPath(rect, element.rotation);
      return (
        <path
          d={d}
          fill={element.fill ?? 'none'}
          stroke={element.stroke ?? 'none'}
          strokeWidth={element.strokeWidth}
          opacity={element.opacity}
        />
      );
    }
    case 'line': {
      const [p1, p2] = lineEndpoints(rect, element.rotation);
      return (
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={element.stroke} strokeWidth={element.strokeWidth} opacity={element.opacity} />
      );
    }
  }
}
