import type { Mm, SheetTemplate } from './types';

export interface Rect {
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
}

export interface DerivedMargins {
  gapX: Mm;
  gapY: Mm;
  marginRight: Mm;
  marginBottom: Mm;
}

export function gapX(template: SheetTemplate): Mm {
  return template.pitchX - template.labelWidth;
}

export function gapY(template: SheetTemplate): Mm {
  return template.pitchY - template.labelHeight;
}

export function derivedMargins(template: SheetTemplate): DerivedMargins {
  const gx = gapX(template);
  const gy = gapY(template);
  const marginRight =
    template.pageSize.width -
    template.marginLeft -
    template.columns * template.labelWidth -
    (template.columns - 1) * gx;
  const marginBottom =
    template.pageSize.height -
    template.marginTop -
    template.rows * template.labelHeight -
    (template.rows - 1) * gy;
  return { gapX: gx, gapY: gy, marginRight, marginBottom };
}

/** Top-left rect of the slot at (col, row), zero-indexed from top-left of the sheet. */
export function slotRect(template: SheetTemplate, col: number, row: number): Rect {
  if (col < 0 || col >= template.columns || row < 0 || row >= template.rows) {
    throw new RangeError(`slot (${col}, ${row}) is out of range for a ${template.columns}x${template.rows} grid`);
  }
  return {
    x: template.marginLeft + col * template.pitchX,
    y: template.marginTop + row * template.pitchY,
    width: template.labelWidth,
    height: template.labelHeight,
  };
}

/** All slots in row-major order: (0,0), (1,0), ..., (cols-1,0), (0,1), ... */
export function allSlots(template: SheetTemplate): Rect[] {
  const slots: Rect[] = [];
  for (let row = 0; row < template.rows; row++) {
    for (let col = 0; col < template.columns; col++) {
      slots.push(slotRect(template, col, row));
    }
  }
  return slots;
}

/**
 * Pitch-mode input: the canonical representation. This is an identity
 * conversion — it exists so callers can go through the same entry point as
 * margin mode.
 */
export interface PitchModeInput {
  pageSize: { width: Mm; height: Mm };
  marginTop: Mm;
  marginLeft: Mm;
  labelWidth: Mm;
  labelHeight: Mm;
  columns: number;
  rows: number;
  pitchX: Mm;
  pitchY: Mm;
}

export function fromPitchMode(input: PitchModeInput): PitchModeInput {
  return { ...input };
}

/**
 * Margin-mode input: all four margins plus label size and grid count. Pitch
 * is solved for by dividing the leftover space between labels evenly across
 * the gaps.
 */
export interface MarginModeInput {
  pageSize: { width: Mm; height: Mm };
  marginTop: Mm;
  marginLeft: Mm;
  marginRight: Mm;
  marginBottom: Mm;
  labelWidth: Mm;
  labelHeight: Mm;
  columns: number;
  rows: number;
}

export function fromMarginMode(input: MarginModeInput): PitchModeInput {
  const availableWidth =
    input.pageSize.width - input.marginLeft - input.marginRight - input.columns * input.labelWidth;
  const availableHeight =
    input.pageSize.height - input.marginTop - input.marginBottom - input.rows * input.labelHeight;

  const solvedGapX = input.columns > 1 ? availableWidth / (input.columns - 1) : 0;
  const solvedGapY = input.rows > 1 ? availableHeight / (input.rows - 1) : 0;

  return {
    pageSize: input.pageSize,
    marginTop: input.marginTop,
    marginLeft: input.marginLeft,
    labelWidth: input.labelWidth,
    labelHeight: input.labelHeight,
    columns: input.columns,
    rows: input.rows,
    pitchX: input.labelWidth + solvedGapX,
    pitchY: input.labelHeight + solvedGapY,
  };
}
