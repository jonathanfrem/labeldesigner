export type Mm = number;

export type LabelShape = 'rect' | 'rounded' | 'ellipse';

export interface SheetTemplate {
  id: string;
  name: string;
  brand?: string;
  code?: string;
  pageSize: { width: Mm; height: Mm };
  marginTop: Mm;
  marginLeft: Mm;
  labelWidth: Mm;
  labelHeight: Mm;
  columns: number;
  rows: number;
  pitchX: Mm;
  pitchY: Mm;
  shape: LabelShape;
  cornerRadius?: Mm;
  builtIn: boolean;
  verified: boolean;
  source?: string;
}

/**
 * scaleX/scaleY are the CORRECTION multiplier applied directly to document
 * coordinates before rendering: `printedMm = documentMm * scale`. 1.0 means
 * no correction.
 *
 * This is deliberately not the same number a user reads off a ruler. If a
 * printer under-prints by 0.5% (a 100mm reference lands at 99.5mm, a
 * *measured error* of 0.995), the correction that fixes it is the
 * reciprocal: 1 / 0.995 ≈ 1.005. The calibration UI collects the measured
 * error (what's directly observable) and inverts it before storing a
 * profile here — never store a raw measured-error reading in this field.
 */
export interface PrinterProfile {
  id: string;
  name: string;
  offsetX: Mm;
  offsetY: Mm;
  scaleX: number;
  scaleY: number;
}

export const IDENTITY_PRINTER_PROFILE: PrinterProfile = {
  id: 'identity',
  name: 'No calibration',
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
};

/**
 * Element types, token parsing and the full document model land in M2 — this
 * shape exists so M0 code that needs "a document" has something to reference,
 * not as the real model.
 */
export interface LabelDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  templateId: string;
  template: SheetTemplate;
  size: { width: Mm; height: Mm };
  elements: unknown[];
}
