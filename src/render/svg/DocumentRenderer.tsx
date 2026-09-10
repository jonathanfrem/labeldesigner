import type { Element, LabelDocument } from '../../model/types';
import type { Point, Rect } from '../../model/geometry';
import { boxCenter, lineEndpoints, rotatePoint } from '../../model/geometry';
import { IDENTITY_PLACEMENT, type Placement } from '../placement';
import { layoutText, ptToMm } from '../../text/layout';
import { useFont } from '../../text/useFont';
import { buildEllipsePath } from '../pdf/ellipsePath';
import { buildLabelClipPath } from '../pdf/labelClip';
import { mapPath, pathToSvgPath } from '../pdf/path';
import { buildRoundedRectPath } from '../pdf/roundedRect';

export interface DocumentRendererProps {
  document: LabelDocument;
  clipId: string;
  placement?: Placement;
}

/**
 * Renders one label instance — background then elements, in array order —
 * clipped to the template's die-cut shape. Mirrors `drawLabelDocument` in
 * render/pdf/document.ts exactly: same clip path builder, same per-element
 * path builders, same paint order, same point-transform approach for
 * placement (never a renderer-native rotate for the shape geometry itself).
 */
export function DocumentRenderer({ document, clipId, placement = IDENTITY_PLACEMENT }: DocumentRendererProps) {
  const localRect: Rect = { x: 0, y: 0, width: document.size.width, height: document.size.height };
  const clipPathData = pathToSvgPath(mapPath(buildLabelClipPath(document.template, localRect), placement.transform));

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={clipPathData} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {document.background?.fill && <path d={clipPathData} fill={document.background.fill} />}
        {document.elements.map((element) => (
          <ElementShape key={element.id} element={element} placement={placement} />
        ))}
      </g>
    </>
  );
}

function ElementShape({ element, placement }: { element: Element; placement: Placement }) {
  if (!element.visible) return null;
  const localRect: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
  const { transform } = placement;

  switch (element.type) {
    case 'rect': {
      const d = pathToSvgPath(mapPath(buildRoundedRectPath(localRect, element.cornerRadius ?? 0, element.rotation), transform));
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
      const d = pathToSvgPath(mapPath(buildEllipsePath(localRect, element.rotation), transform));
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
      const [p1, p2] = lineEndpoints(localRect, element.rotation).map(transform);
      return (
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={element.stroke} strokeWidth={element.strokeWidth} opacity={element.opacity} />
      );
    }
    case 'text':
      return <TextShape element={element} localRect={localRect} placement={placement} />;
  }
}

/**
 * Every glyph is its own `<text>` at the exact position `layoutText`
 * computed — no `textLength`, no `dominant-baseline`, no letter-spacing CSS.
 * The browser only rasterises the glyph shape; every position decision was
 * already made by fontkit (CLAUDE.md invariant 4).
 *
 * Position goes through the same point transform as every other element
 * (element rotation applied locally first, then the placement transform).
 * Orientation has no point-list representation to transform, so it's the
 * one unavoidable renderer-native rotate — a per-glyph
 * `<text transform="rotate(...)">` around that already-placed point, by the
 * combined element + placement rotation angle. See `drawTextElement` in
 * render/pdf/elements.ts for the PDF equivalent (a per-glyph `rotate`
 * option, same angle).
 */
function TextShape({ element, localRect, placement }: { element: Extract<Element, { type: 'text' }>; localRect: Rect; placement: Placement }) {
  const font = useFont(element.fontId);
  if (!font) return null;

  const layout = layoutText(
    element.content,
    {
      fontSizePt: element.fontSizePt,
      lineHeight: element.lineHeight,
      letterSpacing: element.letterSpacing,
      align: element.align,
      verticalAlign: element.verticalAlign,
      autoShrink: element.autoShrink,
      minFontSizePt: element.minFontSizePt,
    },
    localRect.width,
    localRect.height,
    font,
  );

  const elementCenter = boxCenter(localRect);
  const fontSizeMm = ptToMm(layout.fontSizePt);
  const totalAngle = (element.rotation + placement.extraRotationDeg) % 360;

  return (
    <g opacity={element.opacity}>
      {layout.lines.map((line, li) =>
        line.runs.map((run, ri) => {
          const localAnchor: Point = { x: localRect.x + run.x, y: localRect.y + line.baselineY };
          const rotatedByElement = rotatePoint(localAnchor, elementCenter, element.rotation);
          const sheetAnchor = placement.transform(rotatedByElement);
          return (
            <text
              key={`${li}-${ri}`}
              x={sheetAnchor.x}
              y={sheetAnchor.y}
              transform={`rotate(${totalAngle} ${sheetAnchor.x} ${sheetAnchor.y})`}
              fontFamily={element.fontId}
              fontSize={fontSizeMm}
              fill={element.color}
            >
              {run.text}
            </text>
          );
        }),
      )}
    </g>
  );
}
