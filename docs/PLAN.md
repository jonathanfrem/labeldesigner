# Label Designer — Build Plan

A browser-based label design and sheet-printing tool. Replaces BarTender Designer for
A4 die-cut label stock. Fully local, no backend, no accounts, no database.

---

## 1. Product summary

Design a label once, lay it out across an A4 sheet of die-cut labels, and print it so the
artwork lands inside the die-cuts. Aimed at small producers using generic label stock
(Europe100, no-name brands) rather than genuine Avery.

**Primary user:** a one-person product business printing product labels in short runs.
**Secondary:** anyone who lands on the public URL and wants to print a sheet of labels.

---

## 2. Locked architecture decisions

These are settled. Do not relitigate them during implementation.

### 2.1 Static SPA, zero backend
Vite + React + TypeScript, deployable as static files (Cloudflare Pages / GitHub Pages).
No server, no API, no auth, no analytics, no telemetry, no external font/CDN requests at
runtime. Everything the app needs ships in the bundle.

### 2.2 Print via generated PDF, never via CSS `@media print`
The browser print pipeline injects margins, applies "shrink to fit", and behaves
differently per browser and per print driver. Sub-millimetre placement through CSS is not
achievable reliably.

Instead: build the sheet as a PDF with **pdf-lib** at exact coordinates, hand the user a
PDF, and instruct them to print at 100% / "Actual size" with page scaling off. This also
gives "Export sheet as PDF" for free, and makes the output testable in CI.

### 2.3 One document model, two renderers
A single document model in **millimetres** is the source of truth.

- **Screen renderer** → SVG
- **Print renderer** → PDF via pdf-lib

Both walk the same model. No editor-specific state that the PDF path doesn't know about.
Any feature that can't be expressed in both renderers doesn't ship.

### 2.4 Millimetres as SVG user units
Set the sheet `<svg viewBox="0 0 210 297">` and treat 1 user unit = 1 mm. Zoom is a CSS
transform on the container, not a change to the coordinate space. This means editor
coordinates are model coordinates with zero conversion.

PDF uses points (1/72") with a bottom-left origin, so PDF is the only place a conversion
happens. Isolate it in `src/render/pdf/units.ts`:

```ts
export const MM_TO_PT = 72 / 25.4;           // 2.834645669...
export const mmToPt = (mm: number) => mm * MM_TO_PT;
export const yFlip = (yMm: number, pageHmm: number) => mmToPt(pageHmm - yMm);
```

### 2.5 Chromium-first, degrades gracefully
Target Chrome/Edge for the best experience; Firefox and Safari must remain fully usable.
Put every capability difference behind an adapter with a fallback — never a feature check
scattered through components.

| Capability | Chromium | Fallback |
|---|---|---|
| Save / Save As | File System Access API, real overwrite | Download `.lbl.json` |
| Open | `showOpenFilePicker` | `<input type="file">` |
| Autosave target | IndexedDB + file handle | IndexedDB only |
| Open `.lbl.json` by double-click | PWA file handler | n/a |

Safari evicts IndexedDB after ~7 days of no visits and doesn't honour
`navigator.storage.persist()` reliably. Show a persistent, non-nagging reminder to export
when running without a file handle.

### 2.6 Bundled open-licence fonts only
No Google Fonts CDN (a runtime request leaks every user's IP to Google, which German
courts have found to breach GDPR, and it breaks offline use). Google Fonts are OFL /
Apache-2.0, so ship the files.

- Ship **`.ttf`**, not `.woff2`. The same file serves `@font-face` on screen *and* PDF
  embedding. fontkit cannot read woff2.
- Curate ~20–30 families suited to labels. Must include: a workhorse sans with full
  Norwegian coverage (æøåÆØÅ), at least one **condensed** face (critical on small
  labels), a mono for SKUs, a humanist serif, and 2–3 display faces.
- Lazy-load font files on demand; don't ship 30 families in the initial payload.
- pdf-lib + `@pdf-lib/fontkit` subsets on embed, so output PDFs stay small.
- Record each font's licence in `fonts/LICENSES.md` and surface it in an About panel.

---

## 3. The WYSIWYG trap (read before writing the text renderer)

The most likely source of "looks right on screen, wrong in the PDF" is **text metrics**.
If the SVG path lets the browser lay out text while the PDF path uses fontkit metrics,
line breaks and widths will drift.

**Rule:** fontkit is the single source of text measurement for both renderers.

Layout text in the model layer using fontkit (glyph advances, kerning, line breaking),
producing an array of positioned lines. The SVG renderer then draws each line as an
explicitly positioned `<text>` element at the computed baseline — it never relies on
browser wrapping, `textLength`, or `dominant-baseline`. The PDF renderer draws the same
lines at the same coordinates.

Write a test that renders the same text block through both paths and asserts identical
line breaks and baseline positions.

---

## 4. Data model

```ts
type Mm = number;

interface SheetTemplate {
  id: string;
  name: string;               // "Europe100 ELA036"
  brand?: string;
  code?: string;              // "ELA036"
  pageSize: { width: Mm; height: Mm };   // A4: 210 x 297
  marginTop: Mm;
  marginLeft: Mm;
  labelWidth: Mm;
  labelHeight: Mm;
  columns: number;
  rows: number;
  pitchX: Mm;                 // left edge to left edge (labelWidth + gap)
  pitchY: Mm;
  shape: 'rect' | 'rounded' | 'ellipse';
  cornerRadius?: Mm;          // die-cut radius; affects safe area and clipping, not just looks
  builtIn: boolean;
  verified: boolean;          // false until confirmed by a test print
  source?: string;            // where the measurements came from
}
```

Right and bottom margins are **derived, never stored**. Storing all four invites templates
that contradict themselves. Compute and display them instead:

```ts
gapX         = pitchX - labelWidth
gapY         = pitchY - labelHeight
marginRight  = pageWidth  - marginLeft - columns * labelWidth  - (columns - 1) * gapX
marginBottom = pageHeight - marginTop  - rows    * labelHeight - (rows    - 1) * gapY

interface LabelDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  templateId: string;
  template: SheetTemplate;    // denormalised copy so files are self-contained
  size: { width: Mm; height: Mm };  // usually mirrors the template label size
  background?: { fill?: string };
  elements: Element[];
  assets: Record<string, Asset>;    // id -> embedded image
  dataset?: Dataset;                // stage 2
}

type Element = TextElement | ImageElement | BarcodeElement | ShapeElement | LineElement;

interface BaseElement {
  id: string;
  name: string;
  x: Mm; y: Mm;               // top-left of the unrotated bounding box
  width: Mm; height: Mm;
  rotation: number;           // degrees clockwise, about the box centre
  locked: boolean;
  visible: boolean;
  opacity: number;            // 0..1
}

interface TextElement extends BaseElement {
  type: 'text';
  content: string;            // may contain {{Field}} and {{counter}} tokens
  fontId: string;
  fontSizePt: number;
  lineHeight: number;         // multiplier
  letterSpacing: number;      // in em
  align: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
  color: string;
  autoShrink: boolean;        // shrink to fit the box rather than overflow
  minFontSizePt?: number;
}

interface ImageElement extends BaseElement {
  type: 'image';
  assetId: string;
  crop: { x: number; y: number; w: number; h: number };  // 0..1 of source
  fit: 'fill' | 'contain' | 'cover';
}

interface BarcodeElement extends BaseElement {
  type: 'barcode';
  symbology: 'code128' | 'qr';
  value: string;              // may contain tokens
  showText: boolean;          // human-readable interpretation, Code 128 only
  hriFontId?: string;
  hriFontSizePt?: number;
  quietZoneModules: number;   // enforced minimum
  color: string;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';  // QR only
}

interface Asset {
  id: string;
  mime: string;
  dataUrl: string;            // base64 — keeps the project file self-contained
  naturalWidthPx: number;
  naturalHeightPx: number;
}

interface PrinterProfile {
  id: string;
  name: string;               // "Brother HL-L2350DW"
  offsetX: Mm;                // positive shifts artwork right
  offsetY: Mm;                // positive shifts artwork down
  scaleX: number;             // correction multiplier: printedMm = documentMm * scaleX.
  scaleY: number;             // 1.0 = no correction. This is the reciprocal of what a user
                               // reads off a ruler (measured/nominal) — the UI collects the
                               // measured error and inverts it before it lands here.
}
```

**Token syntax** (`{{Field}}`, `{{counter}}`) must be supported in the model and parser
from M0, even though the merge UI is stage 2. Retrofitting this later means touching every
element type.

### 4.1 Project file format

`.lbl.json` — plain JSON, the serialised `LabelDocument`, images inline as data URLs.
Always write `schemaVersion`. Write a migration function stub on day one:

```ts
function migrate(raw: unknown): LabelDocument  // throws a readable error on unknown versions
```

Reject files above the known schema version with a clear message rather than partially
loading them.

### 4.2 Rounded corners and clipping

Plenty of stock is die-cut with rounded corners and margins on all four sides (BNT
Scandinavia 27 15 00, most Herma and Avery product-label ranges). The grid model already
handles the margins, but the radius has three consequences that are easy to miss:

**Safe area must be radius-aware.** A uniform rectangular inset is wrong — the usable area
narrows towards the corners along the arc. Compute the safe region as the label rect inset
by the print tolerance, with its corners inset further by the die-cut radius geometry.
Artwork that clears a rectangular inset can still be sliced off at a corner.

**Backgrounds and images must be clipped to the rounded rect.** Two implementations of one
concept, so it needs a parity test like everything else:

- *SVG:* `clip-path` referencing a `<rect rx="…" ry="…">`.
- *PDF:* pdf-lib has no rounded-rectangle primitive and no first-class clipping. Build the
  path from four cubic bezier arcs (kappa = 0.5522847), then:
  `pushGraphicsState()` → `pushOperators(...pathOps, clip(), endPath())` → draw → `popGraphicsState()`.

Put the rounded-rect path construction in one shared module that emits either SVG path
data or PDF operators, so the two renderers can't drift.

**Bleed becomes meaningful.** With a full-colour background and a rounded die-cut, half a
millimetre of registration error leaves a white crescent at the corners. Add a per-document
`bleed: Mm` (default 0, typical 1 mm) that extends background fills and `cover`-fitted
images past the label boundary. On sheet stock this overprints the waste matrix, which is
harmless — it stays on the liner when the label is peeled. Disable bleed automatically for
templates with zero gap between labels, where it would print onto the neighbouring label.

---

## 5. Seed template library

Ship as `src/data/templates.json`. Seed with these, mark `verified: false` until a test
print confirms each.

| Template | Label | Grid | Notes |
|---|---|---|---|
| Europe100 ELA036 | 105 × 70 mm | 2 × 4 | 8/sheet. 2×105 = 210, so no side margin. Vertical: 4×70 = 280, leaving 8.5 mm top and bottom. Avery 3426 equivalent. |
| Europe100 ELA022 | 105 × 57 mm | 2 × 5 | 10/sheet. No side margin. 5×57 = 285, leaving 6 mm top and bottom. Avery 3425 equivalent. |
| Europe100 ELA034 | 70 × 35 mm | 3 × 8 | 24/sheet. |
| Europe100 ELA035 | 105 × 35 mm | 2 × 8 | 16/sheet. |
| Europe100 ELA021 | 105 × 48 mm | 2 × 6 | 12/sheet. |
| Europe100 ELA024 | 105 × 148.5 mm | 2 × 2 | 4/sheet. 2×105 = 210, so no side margin. 2×148.5 = 297 exactly, so no top/bottom margin either. |
| Europe100 ELA026 | 210 × 148.5 mm | 1 × 2 | 2/sheet. Full width. 2×148.5 = 297 exactly, so no top/bottom margin. |
| Europe100 ELA027 | 210 × 297 mm | 1 × 1 | Full sheet. |
| Avery L7160 | 63.5 × 38.1 mm | 3 × 7 | Common reference size. |
| Avery L7651 | 38.1 × 21.2 mm | 5 × 13 | Small-label reference. |
| BNT Scandinavia 27 15 00 | 48 × 24 mm | 4 × 12 | 48/sheet. Margins on all four sides and rounded corners. 18 mm spare horizontally, 9 mm vertically — the split between margins and gaps, and the corner radius, are **not published**. Ships with a best guess and `verified: false`; must be measured. |
| BNT Scandinavia 27 40 00 | 38.1 × 21.2 mm | 5 × 13 | 65/sheet. Vendor states Avery L7651 compatibility. |

> **Warning to surface in the UI:** several of these run edge-to-edge horizontally (zero
> side margin), but most consumer printers cannot print within ~4–5 mm of the paper edge.
> The safe-area overlay must account for a configurable unprintable margin (default 5 mm)
> and warn when artwork crosses it.

The user's third stock is unbranded and must be measurable by hand — the custom template
editor is not optional.

### 5.1 Entering a template from measurements

Nobody measures pitch. People measure margins and gaps with a ruler, and datasheets quote
margins on all four sides. Offer two input modes over the same underlying model:

- **Pitch mode:** margin top/left, label size, columns, rows, pitch X/Y. Canonical.
- **Margin mode:** all four margins, label size, columns, rows. Pitch is solved for.

Show the derived values from §4 live as the user types, and validate that the numbers close
against the page size. When they don't, say by how much and in which direction rather than
just refusing — being 1.5 mm out usually means one measurement was taken to the wrong edge,
and the residual tells you which.

For rounded corners, radius is measured most easily by comparing against printed reference
arcs. Put a radius gauge (2, 3, 4, 5, 6 mm arcs) on the calibration sheet.

---

## 6. Calibration

Non-original label stock plus consumer printers means the die-cuts and the print will not
agree out of the box. This must exist before the template library is trustworthy.

1. **Test sheet.** A button generates a PDF with a crosshair at each label's centre, a
   1 mm-ruled scale along the top and left of the page, outlines of every label drawn with
   the template's actual corner radius, and a radius gauge in the sheet margin.
2. **Measure.** The user prints on plain paper, holds it against a label sheet (or
   measures the ruler), and reads off the discrepancy.
3. **Correct.** Enter X and Y offset in mm; optionally a scale factor read off the ruler
   (printers commonly drift 0.3–0.5%). Store as a `PrinterProfile`.
4. **Apply.** The active profile shifts and scales the whole page in the PDF renderer
   only. It never touches the document model.

Also verify at step 2 that the ruler measures true — if the 100 mm mark isn't at 100 mm,
the user printed with scaling on, and the app should say exactly that.

---

## 7. Print pipeline

```
LabelDocument + SheetTemplate + PrinterProfile + { startIndex, count, marks }
  → layout engine (which label slot gets which record)
  → pdf-lib document
  → Blob → object URL → open in a new tab
```

Options exposed in the print dialog:

- **Start at label N** (partially used sheets — essential, cheap to build).
- Number of copies / how many labels to fill.
- Draw label outlines (for test prints on plain paper) — off by default.
- Crop marks — off by default.
- Bleed — off by default, disabled entirely on zero-gap templates.
- Printer profile selector.

The dialog must show a short, unmissable instruction: *Print at 100% / Actual size. Turn
off "Fit to page" and "Scale to printable area".* Screenshot-level clarity here saves more
support pain than any other single piece of copy.

---

## 8. Barcodes

Use **bwip-js** as the encoder. It exposes a custom drawing interface
(`bwipjs.render(opts, drawing)`) — implement two drawing backends over the same encoder,
mirroring the app's two-renderer architecture:

- `SvgDrawing` → `<rect>` elements for the editor
- `PdfDrawing` → `page.drawRectangle()` for pdf-lib

Never rasterise a barcode. Vector bars stay crisp at any printer resolution and scan far
more reliably at small sizes.

**v1 symbologies: Code 128 and QR only.** No EAN-13/GS1 (strict sizing, magnification and
check-digit rules — a separate project). Reject out-of-scope symbologies explicitly rather
than half-supporting them.

Requirements:
- Enforce a minimum quiet zone (10 modules for Code 128, 4 for QR) and refuse to shrink
  below it — clamp and warn in the properties panel.
- Warn when the module width falls below ~0.25 mm, which is where consumer laser output
  starts failing to scan.
- Code 128 auto-switches between subsets B and C; let bwip-js handle it.
- HRI text for Code 128 renders as a normal text run with an embedded font, not as part of
  the barcode drawing.

---

## 9. Editor

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ toolbar: template · zoom · undo/redo · save · print          │
├──────────┬────────────────────────────────────┬──────────────┤
│ layers   │                                    │ properties   │
│ +        │        label canvas (SVG)          │ of selection │
│ assets   │        with mm rulers              │              │
│          │                                    │              │
│          ├────────────────────────────────────┤              │
│          │  sheet preview strip (all slots)   │              │
└──────────┴────────────────────────────────────┴──────────────┘
```

### Interaction requirements

- Drag to move; 8 resize handles; rotation handle. Shift constrains aspect/angle (15°
  steps). Alt resizes about the centre.
- Arrow keys nudge 0.5 mm; Shift+arrow 5 mm; Alt+arrow 0.1 mm.
- Snapping to label edges, label centre lines, other elements' edges and centres, with
  visible guides. Hold Ctrl to suspend snapping.
- Numeric X/Y/W/H/rotation inputs in the properties panel, in mm to one decimal.
- Multi-select with marquee and Shift-click; align and distribute.
- Undo/redo across every mutation, coalescing drags into one entry.
- Copy/paste, duplicate (Ctrl+D), z-order controls, lock, hide.
- Safe-area and bleed overlays toggleable.

### State

`zustand` + `immer` for the document, `zundo` for history. Keep transient UI state
(selection, hover, drag deltas, zoom) in a **separate** store from the document — otherwise
undo replays selection changes and history becomes useless.

---

## 10. Design direction

Read `/mnt/skills/public/frontend-design/SKILL.md` and follow its two-pass process
(design plan → critique against this brief → build).

Brief, so the design has something specific to hang on:

This is a **precision instrument**, not a creative playground. The user's mental model is a
workbench: measuring, aligning, checking. The vernacular to mine is metrology and print
production — rulers, registration marks, tolerances, calibration, die-cuts, crop marks. The
one bold element should be **the sheet itself**: give it real presence, real paper
proportions, real millimetre rulers along two edges. Everything else — panels, toolbars,
inputs — stays quiet and dense, closer to a CAD tool or an audio editor than to a
consumer design app.

Explicitly avoid: the cream-background/serif-display/terracotta-accent combination, the
identical-rounded-cards kit, ALL-CAPS eyebrow labels above every panel heading, and
`→` glyphs appended to buttons.

Quality floor, unannounced: visible keyboard focus, full keyboard operation of the editor,
reduced-motion respected, sensible contrast, and a layout that survives a 1280 px laptop.
Mobile is out of scope for the editor — a read-only/print view is acceptable there.

Copy rules: name things as the user understands them ("Start at label", not "slot offset").
Buttons say what happens. Errors say what went wrong and what to do. Empty states invite
an action.

---

## 11. Milestones

Each milestone ends in a working, demonstrable app. Do not start the next until the
acceptance criteria pass.

### M0 — Foundation and the print spine
- Vite + React + TS (strict) + Tailwind scaffold.
- Model types, geometry helpers, unit conversion module.
- SVG sheet preview rendering a template's slots.
- PDF export of an empty sheet with label outlines.
- Calibration test sheet generator + printer profiles.

**Acceptance:** export a calibration sheet for ELA036, print it, and confirm crosshairs
land in the die-cut centres after entering an offset. A unit test asserts that label slot
(0,0) of ELA036 sits at 0, 8.5 mm and that the PDF rect is within 0.01 pt of
297.638 × 198.425 pt.

### M1 — Template library
- Built-in catalogue from `templates.json`, searchable by brand, code and size.
- Custom template editor with a live preview that updates as fields change.
- "Duplicate and edit" from any built-in template.
- Custom templates persisted in IndexedDB; export/import a template as JSON.
- `verified` flag with a "confirm with test print" prompt.

**Acceptance:** create a template for the unbranded stock by measuring it, and print
correctly onto it.

### M2 — Editor core
Text, rectangle, ellipse, line and image elements; selection, transforms, snapping,
alignment, z-order, lock/hide, undo/redo, layers panel, numeric property inputs.

**Acceptance:** build a real product label and see it render identically in the editor and
the exported PDF (visual diff of an SVG-vs-PDF raster at 300 dpi, < 1% pixel difference).

### M3 — Typography
Bundled font catalogue with lazy loading, fontkit-based measurement shared by both
renderers, size/weight/leading/tracking/alignment, auto-shrink-to-fit, PDF embedding with
subsetting.

**Acceptance:** a text block with Norwegian characters, tight tracking and forced line
breaks matches between screen and PDF, line for line.

### M4 — Barcodes
Code 128 and QR via bwip-js with SVG and PDF drawing backends, quiet-zone enforcement,
module-width warnings, HRI text.

**Acceptance:** print a sheet of Code 128 and QR labels at the smallest size the app allows
without warning, and scan every one with a phone.

### M5 — Images
Upload (PNG/JPEG/SVG), crop, rotate, fit modes, effective-DPI readout with a warning below
150 dpi, embedded as data URLs.

**Acceptance:** a cropped, rotated logo prints at the same position and scale as shown.

### M6 — Save, load and project library
File System Access API with fallback, autosave to IndexedDB, project library UI, unsaved-
changes guard, schema migration stub, export/import `.lbl.json`.

**Acceptance:** save on Chrome via Ctrl+S overwriting the same file; save and reopen on
Firefox via download/upload; both round-trip a document with images byte-identically.

### M7 — Stage 2: CSV merge and counters
CSV import with column mapping, `{{Field}}` binding, `{{counter}}` with start/step/padding,
record preview and pagination, multi-page PDF output, skip-blank-record handling.

**Acceptance:** a 250-row CSV produces 25 correct ELA036 sheets in one PDF.

### M8 — Polish
PWA with offline service worker, keyboard shortcut reference, About/licences panel,
onboarding for a first-time user, Norwegian and English UI strings.

---

## 12. Testing

- **Unit (Vitest):** template geometry, slot indexing, unit conversion, offset/scale
  application, token parsing, text layout, Code 128 encoding.
- **PDF golden tests:** generate a PDF, parse it, assert element coordinates in points
  against expected values. This is the regression net for print accuracy — treat a failure
  here as a release blocker.
- **Visual parity:** rasterise the SVG and the PDF page at 300 dpi and diff them.
- **E2E (Playwright):** create a label, add each element type, save, reload, export.

---

## 13. Non-goals for v1

No backend, accounts, database or cloud sync. No runtime external requests of any kind. No
EAN-13/GS1 or other retail symbologies. No thermal/roll printers (Zebra, Brother QL). No
collaborative editing. No template auto-detection from a scan. No mobile editor.

Sheets are assumed to be a **single uniform grid**. Mixed-size sheets and multi-block
layouts (a row of large labels above a block of small ones) are out of scope. Rectangular,
rounded and elliptical die-cuts are supported; irregular shapes are not.

---

## 14. Known risks

| Risk | Mitigation |
|---|---|
| Text metrics diverge between SVG and PDF | fontkit measures for both; parity test in CI |
| Templates with zero side margin exceed the printer's printable area | Configurable unprintable margin, safe-area overlay, warning |
| User prints the PDF with scaling on | Explicit instructions in the print dialog; ruler on the calibration sheet detects it |
| Safari evicts IndexedDB | Export reminder when no file handle is held |
| Barcode too small to scan | Module-width warning at ~0.25 mm; clamp quiet zones |
| Large images bloat the project file | Warn above ~5 MB; offer downscale-on-import to 300 dpi at placed size |
| Seed template dimensions are from retailer listings, not datasheets | Every built-in ships `verified: false` until a test print confirms it |

---

## 15. Getting started

Suggested first session: M0 end to end. Resist building any editor UI until a calibration
sheet prints correctly onto real ELA036 stock — everything above that layer is worthless if
the geometry is wrong, and everything is cheap to build once it's right.
