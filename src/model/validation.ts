import type { SheetTemplate } from './types';
import { derivedMargins } from './geometry';

export type ResidualBand = 'closes' | 'absorbed' | 'warning';

/** Below this overshoot, treat the derived quantity as exact — floating point noise. */
const ABSORBED_THRESHOLD_MM = 0.1;
/** Below this overshoot, note it but don't warn — a fraction of a millimetre absorbed by the derived margin. */
const WARNING_THRESHOLD_MM = 1;

export type ResidualAxis = 'right' | 'bottom' | 'gapX' | 'gapY';

export interface AxisResidual {
  axis: ResidualAxis;
  /** The derived margin or gap itself, mm. Negative means the grid overflows the page, or labels overlap. */
  valueMm: number;
  /** How far into the impossible zone, mm. 0 when the value is non-negative. */
  overshootMm: number;
  band: ResidualBand;
  /** Present for 'absorbed' and 'warning' bands only. */
  message?: string;
}

function bandFor(overshootMm: number): ResidualBand {
  if (overshootMm < ABSORBED_THRESHOLD_MM) return 'closes';
  if (overshootMm < WARNING_THRESHOLD_MM) return 'absorbed';
  return 'warning';
}

function buildResidual(axis: ResidualAxis, valueMm: number, absorbedNote: string, warningNote: string): AxisResidual {
  const overshootMm = valueMm < 0 ? -valueMm : 0;
  const band = bandFor(overshootMm);
  let message: string | undefined;
  if (band === 'absorbed') message = absorbedNote;
  else if (band === 'warning') message = warningNote;
  return { axis, valueMm, overshootMm, band, message };
}

/**
 * Never blocks save: right/bottom margins are always derived (PLAN §4), and
 * a negative gap is just a number, not a refused input — only a residual
 * worth surfacing, banded by how far out it is and in which direction.
 */
export function evaluateTemplateResidual(template: SheetTemplate): AxisResidual[] {
  const margins = derivedMargins(template);
  return [
    buildResidual(
      'right',
      margins.marginRight,
      `Right margin is ${margins.marginRight.toFixed(2)}mm — within rounding, absorbed into the derived margin.`,
      `Grid overflows the right edge by ${(-margins.marginRight).toFixed(2)}mm — check pitch X, column count or left margin.`,
    ),
    buildResidual(
      'bottom',
      margins.marginBottom,
      `Bottom margin is ${margins.marginBottom.toFixed(2)}mm — within rounding, absorbed into the derived margin.`,
      `Grid overflows the bottom edge by ${(-margins.marginBottom).toFixed(2)}mm — check pitch Y, row count or top margin.`,
    ),
    buildResidual(
      'gapX',
      margins.gapX,
      `Horizontal gap is ${margins.gapX.toFixed(2)}mm — within rounding, absorbed into the derived margin.`,
      `Labels overlap horizontally by ${(-margins.gapX).toFixed(2)}mm — check label width, pitch X or column count.`,
    ),
    buildResidual(
      'gapY',
      margins.gapY,
      `Vertical gap is ${margins.gapY.toFixed(2)}mm — within rounding, absorbed into the derived margin.`,
      `Labels overlap vertically by ${(-margins.gapY).toFixed(2)}mm — check label height, pitch Y or row count.`,
    ),
  ];
}
