import type { Element, LabelDocument } from '../../model/types';
import type { Point, Rect } from '../../model/geometry';
import { boxCenter, lineEndpoints } from '../../model/geometry';
import { IDENTITY_PLACEMENT, withElementRotation, type Placement } from '../placement';
import { DEFAULT_HRI_FONT_ID, DEFAULT_HRI_FONT_SIZE_PT, hriBandHeightMm } from '../../barcode/hri';
import { layoutBarcode } from '../../barcode/layout';
import { layoutText, ptToMm } from '../../text/layout';
import { useFont } from '../../text/useFont';
import { buildEllipsePath } from '../pdf/ellipsePath';
import { buildLabelClipPath } from '../pdf/labelClip';
import { mapPath, pathToSvgPath, pathsToSvgPath, polygonToPath } from '../pdf/path';
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
    case 'barcode':
      return <BarcodeShape element={element} localRect={localRect} placement={placement} />;
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
  const toSheet = withElementRotation(placement, elementCenter, element.rotation);

  return (
    <g opacity={element.opacity}>
      {layout.lines.map((line, li) =>
        line.runs.map((run, ri) => {
          const localAnchor: Point = { x: localRect.x + run.x, y: localRect.y + line.baselineY };
          const sheetAnchor = toSheet(localAnchor);
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

/**
 * Bars (Code 128) and merged module polygons (QR) come out of
 * `layoutBarcode` in local mm space, relative to the bars' own box — never
 * rasterised (CLAUDE.md invariant 5). They go through the exact same
 * point-transform pipeline as rect/ellipse (`buildRoundedRectPath` /
 * `polygonToPath` + a point map), and the optional HRI line is a normal
 * text run through the same text-layout module every other TextElement
 * uses, not something bwip-js draws.
 */
function BarcodeShape({ element, localRect, placement }: { element: Extract<Element, { type: 'barcode' }>; localRect: Rect; placement: Placement }) {
  const showHri = element.showText && element.symbology === 'code128';
  const hriFontSizePt = element.hriFontSizePt ?? DEFAULT_HRI_FONT_SIZE_PT;
  const hriHeight = showHri ? hriBandHeightMm(hriFontSizePt) : 0;
  const barsRect: Rect = { x: localRect.x, y: localRect.y, width: localRect.width, height: Math.max(1, localRect.height - hriHeight) };

  const geometry = layoutBarcode({
    symbology: element.symbology,
    value: element.value,
    widthMm: barsRect.width,
    heightMm: barsRect.height,
    quietZoneModules: element.quietZoneModules,
    errorCorrection: element.errorCorrection,
  });

  const elementCenter = boxCenter(localRect);
  const toSheet = withElementRotation(placement, elementCenter, element.rotation);
  const totalAngle = (element.rotation + placement.extraRotationDeg) % 360;

  return (
    <g opacity={element.opacity} fill={element.color}>
      {geometry.bars.map((bar, i) => {
        const abs: Rect = { x: bar.x + barsRect.x, y: bar.y + barsRect.y, width: bar.width, height: bar.height };
        return <path key={`b${i}`} d={pathToSvgPath(mapPath(buildRoundedRectPath(abs, 0, 0), toSheet))} />;
      })}
      {geometry.polygonBatches.map((batch, i) => {
        const paths = batch.map((poly) => mapPath(polygonToPath(poly.map((p) => ({ x: p.x + barsRect.x, y: p.y + barsRect.y }))), toSheet));
        return <path key={`p${i}`} d={pathsToSvgPath(paths)} />;
      })}
      {showHri && (
        <HriText
          value={element.value}
          fontId={element.hriFontId ?? DEFAULT_HRI_FONT_ID}
          fontSizePt={hriFontSizePt}
          rect={{ x: localRect.x, y: localRect.y + barsRect.height, width: localRect.width, height: hriHeight }}
          color={element.color}
          toSheet={toSheet}
          rotationDeg={totalAngle}
        />
      )}
    </g>
  );
}

function HriText({
  value,
  fontId,
  fontSizePt,
  rect,
  color,
  toSheet,
  rotationDeg,
}: {
  value: string;
  fontId: string;
  fontSizePt: number;
  rect: Rect;
  color: string;
  toSheet: (p: Point) => Point;
  rotationDeg: number;
}) {
  const font = useFont(fontId);
  if (!font) return null;

  const layout = layoutText(
    value,
    { fontSizePt, lineHeight: 1, letterSpacing: 0, align: 'center', verticalAlign: 'top', autoShrink: false },
    rect.width,
    rect.height,
    font,
  );
  const fontSizeMm = ptToMm(layout.fontSizePt);

  return (
    <>
      {layout.lines.map((line, li) =>
        line.runs.map((run, ri) => {
          const anchor = toSheet({ x: rect.x + run.x, y: rect.y + line.baselineY });
          return (
            <text
              key={`${li}-${ri}`}
              x={anchor.x}
              y={anchor.y}
              transform={`rotate(${rotationDeg} ${anchor.x} ${anchor.y})`}
              fontFamily={fontId}
              fontSize={fontSizeMm}
              fill={color}
            >
              {run.text}
            </text>
          );
        }),
      )}
    </>
  );
}
