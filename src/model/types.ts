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
 * Text, image and barcode elements land in M3/M5 with their fonts and asset
 * pipelines. M2 covers the plain vector shapes only.
 */
export interface BaseElement {
  id: string;
  name: string;
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
  /** Degrees clockwise about the box centre — matches SVG's `rotate()` sense directly. */
  rotation: number;
  locked: boolean;
  visible: boolean;
  opacity: number;
}

export interface RectElement extends BaseElement {
  type: 'rect';
  fill?: string;
  stroke?: string;
  strokeWidth: Mm;
  /** Clamped the same way as a template's die-cut radius: min(radius, width/2, height/2). */
  cornerRadius?: Mm;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  fill?: string;
  stroke?: string;
  strokeWidth: Mm;
}

/**
 * Drawn from the left-mid to right-mid point of the unrotated box, then
 * rotated about the box centre like every other element — so `rotation` is
 * the only thing that controls a line's angle, and `height` is deliberately
 * inert. Keeping the same box+rotation shape as rect/ellipse means the
 * transform UI (resize/rotate handles) works identically across element
 * types; the editor suppresses the top/bottom handles for lines specifically
 * because they'd have nothing to do.
 */
export interface LineElement extends BaseElement {
  type: 'line';
  stroke: string;
  strokeWidth: Mm;
}

export type Element = RectElement | EllipseElement | LineElement;

export interface LabelDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  templateId: string;
  template: SheetTemplate;
  size: { width: Mm; height: Mm };
  /** Clipped to the template's die-cut shape, same as every element. */
  background?: { fill?: string };
  elements: Element[];
}
