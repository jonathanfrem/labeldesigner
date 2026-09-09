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
  /**
   * Means two different things depending on `builtIn`, and is set through two
   * different paths:
   *
   * - `builtIn: true` — a build-time claim: this geometry was confirmed by a
   *   physical test print before release. It ships fixed in templates.json
   *   and is never changed at runtime; that's a release gate, not something
   *   the running app can decide. Correcting it means shipping a new build.
   * - `builtIn: false` — a user action, toggled from the template detail
   *   panel after the user has printed a test sheet themselves.
   *
   * Editing a built-in's geometry only happens via duplicate-and-edit, which
   * forks it to a new custom template with `verified: false` and
   * `derivedFrom` set — the fork earns its own verification, it doesn't
   * inherit the original's.
   */
  verified: boolean;
  source?: string;
  /** Other vendors' part numbers this stock is sold as compatible with, e.g. "Avery 3426". Searchable. */
  equivalents?: string[];
  /** Id of the template this was duplicated from. Provenance only — never read by geometry or rendering. */
  derivedFrom?: string;
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
