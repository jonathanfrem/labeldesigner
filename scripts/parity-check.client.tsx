import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LabelDocument, SheetTemplate } from '../src/model/types';
import { drawLabelDocument } from '../src/render/pdf/document';
import { mmToPt } from '../src/render/pdf/units';
import { DocumentRenderer } from '../src/render/svg/DocumentRenderer';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

/**
 * Fixed template + document for the M2 renderer parity check. Not part of
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
  ],
};

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

async function rasterizePdf(): Promise<HTMLCanvasElement> {
  const pdfDoc = await PDFDocument.create();
  const pageWidthPt = mmToPt(DEMO_TEMPLATE.labelWidth);
  const pageHeightPt = mmToPt(DEMO_TEMPLATE.labelHeight);
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  drawLabelDocument(
    page,
    DEMO_DOCUMENT,
    { x: 0, y: 0, width: DEMO_TEMPLATE.labelWidth, height: DEMO_TEMPLATE.labelHeight },
    DEMO_TEMPLATE.labelHeight,
  );
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

function ParityCheck() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [result, setResult] = useState<{ svg: HTMLCanvasElement; pdf: HTMLCanvasElement; diff: DiffResult } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const svgCanvas = await rasterizeSvg(svgRef.current!);
        const pdfCanvas = await rasterizePdf();
        const diff = diffCanvases(svgCanvas, pdfCanvas);
        setResult({ svg: svgCanvas, pdf: pdfCanvas, diff });
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  return (
    <>
      <svg
        ref={svgRef}
        width={PX_W}
        height={PX_H}
        viewBox={`0 0 ${DEMO_TEMPLATE.labelWidth} ${DEMO_TEMPLATE.labelHeight}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={0} y={0} width={DEMO_TEMPLATE.labelWidth} height={DEMO_TEMPLATE.labelHeight} fill="#ffffff" />
        <DocumentRenderer document={DEMO_DOCUMENT} origin={{ x: 0, y: 0 }} clipId="parity-demo-clip" />
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
          <pre id="stats">
            {`pixels compared: ${PX_W * PX_H} (${PX_W}x${PX_H} @ ${DPI}dpi)
mean per-pixel channel delta: ${result.diff.meanDiff.toFixed(3)} / 255
max per-pixel channel delta: ${result.diff.maxDiff.toFixed(1)} / 255
pixels over threshold (${DIFF_THRESHOLD}/255): ${result.diff.pctOverThreshold.toFixed(3)}%`}
          </pre>
        </>
      )}
    </>
  );
}

document.getElementById('status')!.textContent = '';
createRoot(document.getElementById('root')!).render(<ParityCheck />);
