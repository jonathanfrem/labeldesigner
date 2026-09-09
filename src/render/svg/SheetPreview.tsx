import type { SheetTemplate } from '../../model/types';
import { allSlots } from '../../model/geometry';
import { roundedRectToSvgPath } from '../pdf/roundedRect';

const RULER_THICKNESS_MM = 6;
const RULER_TICK_INTERVAL_MM = 10;

export interface SheetPreviewProps {
  template: SheetTemplate;
  className?: string;
}

/**
 * Renders a template's slots at correct proportions with millimetre rulers
 * along the top and left edges. SVG user units are millimetres throughout;
 * zoom is left to the caller as a CSS transform on the container.
 */
export function SheetPreview({ template, className }: SheetPreviewProps) {
  const { width: pageW, height: pageH } = template.pageSize;
  const viewW = pageW + RULER_THICKNESS_MM;
  const viewH = pageH + RULER_THICKNESS_MM;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      className={className}
      role="img"
      aria-label={`Sheet preview for ${template.name}`}
    >
      <g transform={`translate(${RULER_THICKNESS_MM}, ${RULER_THICKNESS_MM})`}>
        <rect x={0} y={0} width={pageW} height={pageH} fill="white" stroke="#999" strokeWidth={0.2} />
        {allSlots(template).map((slot, i) => (
          <path
            key={i}
            d={roundedRectToSvgPath(slot, template.shape === 'rounded' ? (template.cornerRadius ?? 0) : 0)}
            fill="none"
            stroke="#333"
            strokeWidth={0.2}
          />
        ))}
      </g>

      {/* Top ruler */}
      <g data-testid="ruler-top">
        {ticks(pageW).map((mm) => (
          <g key={mm} transform={`translate(${RULER_THICKNESS_MM + mm}, 0)`}>
            <line x1={0} y1={RULER_THICKNESS_MM - 2} x2={0} y2={RULER_THICKNESS_MM} stroke="#666" strokeWidth={0.15} />
            <text x={0.5} y={RULER_THICKNESS_MM - 2.5} fontSize={2} fill="#666">
              {mm}
            </text>
          </g>
        ))}
      </g>

      {/* Left ruler */}
      <g data-testid="ruler-left">
        {ticks(pageH).map((mm) => (
          <g key={mm} transform={`translate(0, ${RULER_THICKNESS_MM + mm})`}>
            <line x1={RULER_THICKNESS_MM - 2} y1={0} x2={RULER_THICKNESS_MM} y2={0} stroke="#666" strokeWidth={0.15} />
            <text x={0.2} y={-0.5} fontSize={2} fill="#666">
              {mm}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function ticks(lengthMm: number): number[] {
  const result: number[] = [];
  for (let mm = 0; mm <= lengthMm; mm += RULER_TICK_INTERVAL_MM) {
    result.push(mm);
  }
  return result;
}
