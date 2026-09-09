import { useEffect, useMemo, useState } from 'react';
import type { SheetTemplate } from '../../model/types';
import { derivedMargins } from '../../model/geometry';
import { SheetPreview } from '../../render/svg/SheetPreview';
import { renderEmptySheetPdf } from '../../render/pdf/sheet';
import { renderCalibrationSheetPdf } from '../../render/pdf/calibration';
import { NumberField } from '../../components/NumberField';

const REFERENCE_LENGTH_MM = 100;

export interface WorkbenchProps {
  template: SheetTemplate;
  onBack: () => void;
  /** Set when arriving via "Go to calibration sheet" — generates the calibration PDF immediately. */
  autoOpenCalibration?: boolean;
}

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

export function Workbench({ template, onBack, autoOpenCalibration }: WorkbenchProps) {
  const [calibration, setCalibration] = useState<MeasuredCalibration>(IDENTITY_CALIBRATION);
  const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);

  const margins = useMemo(() => derivedMargins(template), [template]);

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

  useEffect(() => {
    if (autoOpenCalibration) handleExportCalibrationSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCalibration]);

  return (
    <div className="flex-1 flex min-h-0">
      <aside className="w-80 shrink-0 border-r border-line bg-panel p-4 space-y-6 overflow-y-auto">
        <button className="text-xs text-ink-secondary hover:text-ink" onClick={onBack}>
          Back to library
        </button>

        <section>
          <SectionLabel>Template</SectionLabel>
          <h2 className="text-sm font-medium text-ink">{template.name}</h2>
          {!template.verified && (
            <p className="mt-2 text-xs text-warn">Unverified geometry — confirm with a test print before trusting this template.</p>
          )}
        </section>

        <section className="text-sm space-y-1">
          <SectionLabel>Derived geometry</SectionLabel>
          <Row label="Gap X" value={`${margins.gapX.toFixed(2)} mm`} />
          <Row label="Gap Y" value={`${margins.gapY.toFixed(2)} mm`} />
          <Row label="Margin right" value={`${margins.marginRight.toFixed(2)} mm`} />
          <Row label="Margin bottom" value={`${margins.marginBottom.toFixed(2)} mm`} />
        </section>

        <section>
          <SectionLabel>Printer calibration</SectionLabel>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <NumberField label="Offset X" suffix="mm" value={calibration.offsetX} onChange={(v) => updateCalibration({ offsetX: v })} />
            <NumberField label="Offset Y" suffix="mm" value={calibration.offsetY} onChange={(v) => updateCalibration({ offsetY: v })} />
            <NumberField
              label={`Measured scale X (${REFERENCE_LENGTH_MM}mm ÷ actual)`}
              value={calibration.measuredScaleX}
              onChange={(v) => updateCalibration({ measuredScaleX: v })}
            />
            <NumberField
              label={`Measured scale Y (${REFERENCE_LENGTH_MM}mm ÷ actual)`}
              value={calibration.measuredScaleY}
              onChange={(v) => updateCalibration({ measuredScaleY: v })}
            />
          </div>
          <p className="mt-2 text-xs text-ink-tertiary">
            On the printed calibration sheet, measure how long the {REFERENCE_LENGTH_MM}mm ruler span actually printed. Enter the ratio
            you measured, actual ÷ intended — e.g. 0.995 if it printed as {(REFERENCE_LENGTH_MM * 0.995).toFixed(1)}mm. Not the
            correction; the app inverts it for you.
          </p>
          <div className="mt-2 rounded border border-line bg-panel-raised px-2 py-1.5 text-xs space-y-0.5 font-mono">
            <ScaleReadout label="X" measured={calibration.measuredScaleX} correction={profile.scaleX} />
            <ScaleReadout label="Y" measured={calibration.measuredScaleY} correction={profile.scaleY} />
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel>Print</SectionLabel>
          <button className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line" onClick={handleExportEmptySheet}>
            Export empty sheet PDF
          </button>
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line"
            onClick={handleExportCalibrationSheet}
          >
            Export calibration sheet PDF
          </button>
          <p className="text-xs text-ink-tertiary">
            Print at 100% / Actual size. Turn off &ldquo;Fit to page&rdquo; and &ldquo;Scale to printable area&rdquo;.
          </p>
        </section>
      </aside>

      <main className="flex-1 flex flex-col p-8 overflow-auto bg-mat">
        {pdfPreview ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-ink-secondary">{pdfPreview.filename}</span>
              <div className="flex gap-2">
                <a href={pdfPreview.url} download={pdfPreview.filename} className="bg-panel-raised hover:bg-line border border-line rounded px-3 py-1.5 text-sm text-ink">
                  Download
                </a>
                <button
                  className="bg-panel hover:bg-panel-raised rounded px-3 py-1.5 text-sm border border-line text-ink"
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
            <SheetPreview template={template} className="h-full max-h-[900px] bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
          </div>
        )}
      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <h3 className="text-xs font-medium text-ink-secondary mb-2 pl-2 border-l-2 border-line-strong">{children}</h3>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-secondary font-mono">
      <span className="text-ink-tertiary font-sans">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ScaleReadout({ label, measured, correction }: { label: string; measured: number; correction: number }) {
  const uncorrectedMm = REFERENCE_LENGTH_MM * measured;
  const correctedMm = uncorrectedMm * correction;
  return (
    <div className="flex justify-between text-ink-secondary">
      <span className="text-ink-tertiary">{label}:</span>
      <span>
        {REFERENCE_LENGTH_MM}mm measured {uncorrectedMm.toFixed(2)}mm → correction ×{correction.toFixed(4)} → {correctedMm.toFixed(2)}mm
      </span>
    </div>
  );
}
