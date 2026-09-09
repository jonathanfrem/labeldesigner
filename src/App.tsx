import { useEffect, useMemo, useState } from 'react';
import templatesData from './data/templates.json';
import type { SheetTemplate } from './model/types';
import { derivedMargins } from './model/geometry';
import { SheetPreview } from './render/svg/SheetPreview';
import { renderEmptySheetPdf } from './render/pdf/sheet';
import { renderCalibrationSheetPdf } from './render/pdf/calibration';

const templates = templatesData as SheetTemplate[];
const REFERENCE_LENGTH_MM = 100;

interface PdfPreview {
  url: string;
  filename: string;
}

/**
 * What the calibration UI collects: the ruler-measured error (actual ÷
 * nominal — 0.995 if a 100mm span printed 0.5% small), not the correction
 * that gets applied. See PrinterProfile in model/types.ts for why those are
 * kept distinct.
 */
interface MeasuredCalibration {
  offsetX: number;
  offsetY: number;
  measuredScaleX: number;
  measuredScaleY: number;
}

const IDENTITY_CALIBRATION: MeasuredCalibration = {
  offsetX: 0,
  offsetY: 0,
  measuredScaleX: 1,
  measuredScaleY: 1,
};

export default function App() {
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [calibration, setCalibration] = useState<MeasuredCalibration>(IDENTITY_CALIBRATION);
  const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);

  const template = useMemo(() => templates.find((t) => t.id === templateId)!, [templateId]);
  const margins = useMemo(() => derivedMargins(template), [template]);

  // The profile actually applied by the renderers: offsets pass through
  // unchanged, but scale is the reciprocal of what the user measured — see
  // PrinterProfile's doc comment.
  const profile = useMemo(
    () => ({
      id: 'user',
      name: 'Custom',
      offsetX: calibration.offsetX,
      offsetY: calibration.offsetY,
      scaleX: 1 / calibration.measuredScaleX,
      scaleY: 1 / calibration.measuredScaleY,
    }),
    [calibration],
  );

  // Blob URLs are only valid for the lifetime of the document that created
  // them; revoke the previous one whenever it's replaced or the app unmounts.
  useEffect(() => {
    return () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview]);

  function updateCalibration(patch: Partial<MeasuredCalibration>) {
    setCalibration((prev) => ({ ...prev, ...patch }));
  }

  function showPdf(bytes: Uint8Array, filename: string) {
    const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    setPdfPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url, filename };
    });
  }

  async function handleExportEmptySheet() {
    const bytes = await renderEmptySheetPdf(template, profile);
    showPdf(bytes, `${template.code ?? template.id}-empty-sheet.pdf`);
  }

  async function handleExportCalibrationSheet() {
    const { bytes } = await renderCalibrationSheetPdf(template, profile);
    showPdf(bytes, `${template.code ?? template.id}-calibration-sheet.pdf`);
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 flex">
      <aside className="w-80 shrink-0 border-r border-neutral-700 p-4 space-y-6 overflow-y-auto">
        <section>
          <h2 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Template</h2>
          <select
            className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1.5 text-sm"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.labelWidth}×{t.labelHeight}mm, {t.columns}×{t.rows}
              </option>
            ))}
          </select>
          {!template.verified && (
            <p className="mt-2 text-xs text-amber-400">Unverified geometry — confirm with a test print before trusting this template.</p>
          )}
        </section>

        <section className="text-sm space-y-1">
          <h2 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Derived geometry</h2>
          <Row label="Gap X" value={`${margins.gapX.toFixed(2)} mm`} />
          <Row label="Gap Y" value={`${margins.gapY.toFixed(2)} mm`} />
          <Row label="Margin right" value={`${margins.marginRight.toFixed(2)} mm`} />
          <Row label="Margin bottom" value={`${margins.marginBottom.toFixed(2)} mm`} />
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Printer calibration</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <NumberField
              label="Offset X (mm)"
              value={calibration.offsetX}
              onChange={(v) => updateCalibration({ offsetX: v })}
              step={0.1}
            />
            <NumberField
              label="Offset Y (mm)"
              value={calibration.offsetY}
              onChange={(v) => updateCalibration({ offsetY: v })}
              step={0.1}
            />
            <NumberField
              label={`Measured scale X (${REFERENCE_LENGTH_MM}mm ÷ actual)`}
              value={calibration.measuredScaleX}
              onChange={(v) => updateCalibration({ measuredScaleX: v })}
              step={0.001}
            />
            <NumberField
              label={`Measured scale Y (${REFERENCE_LENGTH_MM}mm ÷ actual)`}
              value={calibration.measuredScaleY}
              onChange={(v) => updateCalibration({ measuredScaleY: v })}
              step={0.001}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            On the printed calibration sheet, measure how long the {REFERENCE_LENGTH_MM}mm ruler
            span actually printed. Enter the ratio you measured, actual ÷ intended — e.g. 0.995 if
            it printed as {(REFERENCE_LENGTH_MM * 0.995).toFixed(1)}mm. Not the correction; the app
            inverts it for you.
          </p>
          <div className="mt-2 rounded border border-neutral-700 bg-neutral-800/60 px-2 py-1.5 text-xs space-y-0.5">
            <ScaleReadout label="X" measured={calibration.measuredScaleX} correction={profile.scaleX} />
            <ScaleReadout label="Y" measured={calibration.measuredScaleY} correction={profile.scaleY} />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Print</h2>
          <button
            className="w-full bg-neutral-700 hover:bg-neutral-600 rounded px-3 py-2 text-sm"
            onClick={handleExportEmptySheet}
          >
            Export empty sheet PDF
          </button>
          <button
            className="w-full bg-neutral-700 hover:bg-neutral-600 rounded px-3 py-2 text-sm"
            onClick={handleExportCalibrationSheet}
          >
            Export calibration sheet PDF
          </button>
          <p className="text-xs text-neutral-400">
            Print at 100% / Actual size. Turn off &ldquo;Fit to page&rdquo; and &ldquo;Scale to printable area&rdquo;.
          </p>
        </section>
      </aside>

      <main className="flex-1 flex flex-col p-8 overflow-auto">
        {pdfPreview ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-neutral-400">{pdfPreview.filename}</span>
              <div className="flex gap-2">
                <a
                  href={pdfPreview.url}
                  download={pdfPreview.filename}
                  className="bg-neutral-700 hover:bg-neutral-600 rounded px-3 py-1.5 text-sm"
                >
                  Download
                </a>
                <button
                  className="bg-neutral-800 hover:bg-neutral-700 rounded px-3 py-1.5 text-sm border border-neutral-600"
                  onClick={() => setPdfPreview(null)}
                >
                  Back to sheet preview
                </button>
              </div>
            </div>
            <iframe title={pdfPreview.filename} src={pdfPreview.url} className="flex-1 min-h-0 w-full bg-white rounded" />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <SheetPreview template={template} className="h-full max-h-[900px] bg-white shadow-lg" />
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-neutral-300">
      <span className="text-neutral-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ScaleReadout({ label, measured, correction }: { label: string; measured: number; correction: number }) {
  const uncorrectedMm = REFERENCE_LENGTH_MM * measured;
  const correctedMm = uncorrectedMm * correction;
  return (
    <div className="flex justify-between text-neutral-300">
      <span className="text-neutral-500">{label}:</span>
      <span>
        {REFERENCE_LENGTH_MM}mm measured {uncorrectedMm.toFixed(2)}mm → correction ×{correction.toFixed(4)} →{' '}
        {correctedMm.toFixed(2)}mm
      </span>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
}) {
  return (
    <label className="block">
      <span className="block text-neutral-500 text-xs mb-1">{label}</span>
      <input
        type="number"
        className="w-full bg-neutral-800 border border-neutral-600 rounded px-2 py-1"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
