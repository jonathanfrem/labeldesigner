# Label Designer

Browser-based label design and A4 sheet-printing tool. Static SPA, no backend.
Full spec: `docs/PLAN.md` — read it before making architectural decisions.

## Invariants

These are settled. Do not change them without asking.

1. **No backend, no network at runtime.** No API calls, no CDN fonts, no analytics,
   no telemetry. Everything ships in the bundle.
2. **Printing goes through generated PDF, never CSS `@media print`.** pdf-lib only.
3. **One document model in millimetres, two renderers** (SVG for screen, PDF for print).
   Any feature that can't be expressed in both doesn't ship.
4. **fontkit is the only source of text measurement**, for both renderers. Never rely on
   browser text layout or `textLength`.
5. **Barcodes are vector, never rasterised.** bwip-js encoder, two drawing backends.
6. **SVG user units are millimetres.** `viewBox="0 0 210 297"` for A4. Zoom is a CSS
   transform, never a viewBox change.
7. **Point conversion happens in exactly one module:** `src/render/pdf/units.ts`.
8. **Printer calibration is applied in the PDF renderer only.** It never mutates the
   document model.
9. **Fonts ship as `.ttf`** (used for both `@font-face` and PDF embedding). Open licences
   only; record them in `fonts/LICENSES.md`.
10. **Document state and UI state live in separate stores.** Selection, hover and zoom must
    never enter undo history.

## Commands

```
npm run dev        # vite dev server
npm run build      # production build
npm run test       # vitest
npm run test:pdf   # PDF golden tests
npm run lint       # eslint + tsc --noEmit
```

## Conventions

- TypeScript strict. No `any` outside `.d.ts` shims.
- All lengths in the model are millimetres, typed as `Mm`. Never mix in px or pt.
- Geometry and layout logic is pure and unit-testable; keep it out of components.
- Every user-facing string goes through the i18n layer (nb + en).
- Commit per logical change with a message that says what changed and why.

## Before saying a milestone is done

Run `npm run lint && npm run test && npm run test:pdf`. A failing PDF golden test is a
blocker, not a warning — it means print geometry regressed.

## Units tests
don't add tests unless I ask. If you want to add one, ask me before doing it.