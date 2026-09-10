import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LabelDocument, SheetTemplate } from '../src/model/types';
import { drawLabelDocument } from '../src/render/pdf/document';
import { embedFontsForElements } from '../src/render/pdf/fonts';
import { mmToPt } from '../src/render/pdf/units';
import { DocumentRenderer } from '../src/render/svg/DocumentRenderer';
import { slotPlacement } from '../src/render/placement';
import { ensureFontFaceRegistered } from '../src/text/fontFace';
import { loadFont } from '../src/text/fontLoader';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

/**
 * Fixed templates + documents for the renderer parity check. Not part of
 * the app — this file is only reachable via parity-check.html, which isn't
 * referenced from index.html/main.tsx, so it never enters `npm run build`'s
 * module graph (invariant 1: pdfjs-dist stays a devDependency only).
 */
const DEMO_TEMPLATE: SheetTemplate = {
  id: 'parity-demo',
  name: 'Parity demo (rounded, 60×40, r=8)',
  pageSize: { width: 60, height: 40 },
  marginTop: 0,
  marginLeft: 0,
  labelWidth: 60,
  labelHeight: 40,
  columns: 1,
  rows: 1,
  pitchX: 60,
  pitchY: 40,
  shape: 'rounded',
  cornerRadius: 8,
  builtIn: false,
  verified: false,
};

const DEMO_DOCUMENT: LabelDocument = {
  schemaVersion: 1,
  id: 'parity-demo-doc',
  name: 'Parity demo',
  templateId: DEMO_TEMPLATE.id,
  template: DEMO_TEMPLATE,
  size: { width: 60, height: 40 },
  contentRotation: 0,
  background: { fill: '#eef2f5' },
  elements: [
    {
      id: 'r1',
      name: 'Rotated rect',
      type: 'rect',
      x: 5,
      y: 5,
      width: 30,
      height: 20,
      rotation: 20,
      locked: false,
      visible: true,
      opacity: 0.6,
      fill: '#3b82f6',
      stroke: '#1d4ed8',
      strokeWidth: 0.5,
      cornerRadius: 3,
    },
    {
      id: 'e1',
      name: 'Rotated ellipse',
      type: 'ellipse',
      x: 18,
      y: 9,
      width: 28,
      height: 16,
      rotation: 35,
      locked: false,
      visible: true,
      opacity: 0.5,
      fill: '#f97316',
    },
    {
      id: 'l1',
      name: 'Diagonal line',
      type: 'line',
      x: 0,
      y: 20,
      width: 60,
      height: 0,
      rotation: -10,
      locked: false,
      visible: true,
      opacity: 1,
      stroke: '#111827',
      strokeWidth: 1.2,
    },
    // Straddles the top-right rounded corner: crosses the straight top edge,
    // the straight right edge, AND the bezier corner arc, all at an angle.
    {
      id: 'r2',
      name: 'Corner-bleed rect',
      type: 'rect',
      x: 46,
      y: -8,
      width: 22,
      height: 22,
      rotation: 28,
      locked: false,
      visible: true,
      opacity: 0.85,
      fill: '#10b981',
      stroke: '#047857',
      strokeWidth: 0.4,
    },
    // M3 acceptance criteria (PLAN §11): Norwegian characters, tight negative
    // tracking, and a box narrow enough to force wraps — the case most
    // likely to drift between the two renderers if either one ever touched
    // browser text layout.
    {
      id: 't1',
      name: 'Typography parity text',
      type: 'text',
      x: 2,
      y: 2,
      width: 26,
      height: 30,
      rotation: -8,
      locked: false,
      visible: true,
      opacity: 1,
      content: 'Blåbær\nsyltetøy\nÆØÅ fra Ærlegård gård i Blåfjell',
      fontId: 'source-serif-4-bold',
      fontSizePt: 9,
      lineHeight: 1.05,
      letterSpacing: -0.04,
      align: 'left',
      verticalAlign: 'top',
      color: '#0f172a',
      autoShrink: false,
    },
  ],
};

/**
 * Same physical die-cut as DEMO_TEMPLATE (60×40 landscape), but the document
 * is authored contentRotation:90 — `size` swaps to 40×60 portrait, and the
 * elements below are laid out upright in that portrait frame. This is the
 * case that exercises `placeInSlot`: both renderers must rotate this local
 * content 90° into the landscape slot, not just translate it.
 */
const ROTATED_DEMO_DOCUMENT: LabelDocument = {
  schemaVersion: 1,
  id: 'parity-demo-doc-rotated',
  name: 'Parity demo (contentRotation 90)',
  templateId: DEMO_TEMPLATE.id,
  template: DEMO_TEMPLATE,
  size: { width: 40, height: 60 },
  contentRotation: 90,
  background: { fill: '#fef3e8' },
  elements: [
    {
      id: 'rr1',
      name: 'Top band',
      type: 'rect',
      x: 4,
      y: 4,
      width: 32,
      height: 14,
      rotation: 0,
      locked: false,
      visible: true,
      opacity: 1,
      fill: '#f59e0b',
      stroke: '#b45309',
      strokeWidth: 0.5,
      cornerRadius: 2,
    },
    {
      id: 'rt1',
      name: 'Portrait text',
      type: 'text',
      x: 4,
      y: 24,
      width: 32,
      height: 30,
      rotation: 0,
      locked: false,
      visible: true,
      opacity: 1,
      content: 'Blåbær\nÆØÅ portrett',
      fontId: 'inter-bold',
      fontSizePt: 8,
      lineHeight: 1.15,
      letterSpacing: 0,
      align: 'center',
      verticalAlign: 'top',
      color: '#111827',
      autoShrink: false,
    },
  ],
};

const SLOT_RECT = { x: 0, y: 0, width: DEMO_TEMPLATE.labelWidth, height: DEMO_TEMPLATE.labelHeight };

const DPI = 300;
const PX_W = Math.round((DEMO_TEMPLATE.labelWidth * DPI) / 25.4);
const PX_H = Math.round((DEMO_TEMPLATE.labelHeight * DPI) / 25.4);
const DIFF_THRESHOLD = 32; // out of 255, per-pixel mean channel delta

interface DiffResult {
  meanDiff: number;
  maxDiff: number;
  pctOverThreshold: number;
  diffCanvas: HTMLCanvasElement;
}

function rasterizeSvg(svgEl: SVGSVGElement): Promise<HTMLCanvasElement> {
  const serialized = new XMLSerializer().serializeToString(svgEl);
  const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(serialized)))}`;
  const img = new Image();
  img.src = dataUrl;
  return img.decode().then(() => {
    const canvas = document.createElement('canvas');
    canvas.width = PX_W;
    canvas.height = PX_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PX_W, PX_H);
    ctx.drawImage(img, 0, 0, PX_W, PX_H);
    return canvas;
  });
}

async function rasterizePdf(doc: LabelDocument): Promise<HTMLCanvasElement> {
  const pdfDoc = await PDFDocument.create();
  const pageWidthPt = mmToPt(DEMO_TEMPLATE.labelWidth);
  const pageHeightPt = mmToPt(DEMO_TEMPLATE.labelHeight);
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  const fonts = await embedFontsForElements(pdfDoc, doc.elements);
  drawLabelDocument(page, doc, SLOT_RECT, DEMO_TEMPLATE.labelHeight, fonts);
  const bytes = await pdfDoc.save({ useObjectStreams: false });

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pdfPage = await pdf.getPage(1);
  const scale = PX_W / pageWidthPt;
  const viewport = pdfPage.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PX_W, PX_H);
  await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

function diffCanvases(a: HTMLCanvasElement, b: HTMLCanvasElement): DiffResult {
  const aData = a.getContext('2d')!.getImageData(0, 0, PX_W, PX_H).data;
  const bData = b.getContext('2d')!.getImageData(0, 0, PX_W, PX_H).data;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = PX_W;
  diffCanvas.height = PX_H;
  const dctx = diffCanvas.getContext('2d')!;
  const out = dctx.createImageData(PX_W, PX_H);

  let sum = 0;
  let max = 0;
  let over = 0;
  const pixelCount = PX_W * PX_H;

  for (let i = 0; i < aData.length; i += 4) {
    const d = (Math.abs(aData[i] - bData[i]) + Math.abs(aData[i + 1] - bData[i + 1]) + Math.abs(aData[i + 2] - bData[i + 2])) / 3;
    sum += d;
    if (d > max) max = d;
    if (d > DIFF_THRESHOLD) over++;
    const shade = 255 - Math.min(255, d * 3);
    out.data[i] = shade;
    out.data[i + 1] = shade;
    out.data[i + 2] = shade;
    out.data[i + 3] = 255;
  }
  dctx.putImageData(out, 0, 0);

  return {
    meanDiff: sum / pixelCount,
    maxDiff: max,
    pctOverThreshold: (over / pixelCount) * 100,
    diffCanvas,
  };
}

function Scenario({ title, doc }: { title: string; doc: LabelDocument }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [result, setResult] = useState<{ svg: HTMLCanvasElement; pdf: HTMLCanvasElement; diff: DiffResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // TextShape (DocumentRenderer.tsx) renders nothing for a text element
        // until its font has loaded, then re-renders once it has. Warm the
        // cache and wait a couple of frames for that re-render to commit
        // before rasterizing the SVG, so the comparison isn't racing fetch().
        const fontIds = [...new Set(doc.elements.filter((e) => e.type === 'text').map((e) => e.fontId))];
        await Promise.all(fontIds.flatMap((id) => [loadFont(id), ensureFontFaceRegistered(id)]));
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

        const svgCanvas = await rasterizeSvg(svgRef.current!);
        const pdfCanvas = await rasterizePdf(doc);
        const diff = diffCanvases(svgCanvas, pdfCanvas);
        setResult({ svg: svgCanvas, pdf: pdfCanvas, diff });
      } catch (err) {
        setError(String(err));
      }
    })();
  }, [doc]);

  return (
    <section style={{ marginBottom: 32 }}>
      <h1>{title}</h1>
      <svg
        ref={svgRef}
        width={PX_W}
        height={PX_H}
        viewBox={`0 0 ${DEMO_TEMPLATE.labelWidth} ${DEMO_TEMPLATE.labelHeight}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={0} y={0} width={DEMO_TEMPLATE.labelWidth} height={DEMO_TEMPLATE.labelHeight} fill="#ffffff" />
        <DocumentRenderer document={doc} clipId={`parity-clip-${doc.id}`} placement={slotPlacement(doc, SLOT_RECT)} />
      </svg>

      {error && <pre style={{ color: '#f87171' }}>{error}</pre>}

      {result && (
        <>
          <div className="row">
            <div className="cell">
              <h2>SVG raster ({PX_W}×{PX_H}px)</h2>
              <img src={result.svg.toDataURL()} width={320} />
            </div>
            <div className="cell">
              <h2>PDF raster (via pdfjs-dist, same px)</h2>
              <img src={result.pdf.toDataURL()} width={320} />
            </div>
            <div className="cell">
              <h2>Diff (white = match, dark = differs)</h2>
              <img src={result.diff.diffCanvas.toDataURL()} width={320} />
            </div>
          </div>
          <pre className="stats">
            {`pixels compared: ${PX_W * PX_H} (${PX_W}x${PX_H} @ ${DPI}dpi)
mean per-pixel channel delta: ${result.diff.meanDiff.toFixed(3)} / 255
max per-pixel channel delta: ${result.diff.maxDiff.toFixed(1)} / 255
pixels over threshold (${DIFF_THRESHOLD}/255): ${result.diff.pctOverThreshold.toFixed(3)}%`}
          </pre>
        </>
      )}
    </section>
  );
}

function ParityCheck() {
  return (
    <>
      <Scenario title="SVG vs PDF renderer parity — shapes, text" doc={DEMO_DOCUMENT} />
      <Scenario title="SVG vs PDF renderer parity — contentRotation: 90" doc={ROTATED_DEMO_DOCUMENT} />
    </>
  );
}

document.getElementById('status')!.textContent = '';
createRoot(document.getElementById('root')!).render(<ParityCheck />);
