import { useEffect, useMemo, useState } from 'react';
import type { SheetTemplate } from '../../model/types';
import { derivedMargins } from '../../model/geometry';
import { SheetPreview } from '../../render/svg/SheetPreview';
import { renderEmptySheetPdf } from '../../render/pdf/sheet';
import { renderCalibrationSheetPdf } from '../../render/pdf/calibration';
import { renderLabelSheetPdf } from '../../render/pdf/document';
import { NumberField } from '../../components/NumberField';
import { Editor } from '../editor/Editor';
import { useProjectSessionContext } from '../../state/projectSessionContext';
import { useDocumentStore } from '../../state/documentStore';

const REFERENCE_LENGTH_MM = 100;

export interface WorkbenchProps {
  template: SheetTemplate;
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

type WorkbenchTab = 'design' | 'print';

export function Workbench({ template, autoOpenCalibration }: WorkbenchProps) {
  const [tab, setTab] = useState<WorkbenchTab>(autoOpenCalibration ? 'print' : 'design');
  const [calibration, setCalibration] = useState<MeasuredCalibration>(IDENTITY_CALIBRATION);
  const [pdfPreview, setPdfPreview] = useState<PdfPreview | null>(null);
  const [startAtLabel, setStartAtLabel] = useState(1);
  const [showOutlines, setShowOutlines] = useState(false);
  const { pendingMismatch, addEmbeddedAsCustomTemplate, updateToLibraryTemplate, dismissMismatch } = useProjectSessionContext();
  const activeDocument = useDocumentStore((s) => s.document);
  const renameDocument = useDocumentStore((s) => s.renameDocument);

  const margins = useMemo(() => derivedMargins(template), [template]);
  const totalSlots = template.columns * template.rows;

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

  async function handleExportLabelSheet() {
    const bytes = await renderLabelSheetPdf(activeDocument, profile, {
      startIndex: Math.max(0, startAtLabel - 1),
      showOutlines,
    });
    showPdf(bytes, `${activeDocument.name || template.code || template.id}-sheet.pdf`);
  }

  useEffect(() => {
    if (autoOpenCalibration) handleExportCalibrationSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCalibration]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-4 px-4 h-10 border-b border-line bg-panel">
        <EditableDocumentName name={activeDocument.name} onRename={renameDocument} />
        <div className="ml-auto flex gap-1">
          <TabButton active={tab === 'design'} onClick={() => setTab('design')}>
            Design
          </TabButton>
          <TabButton active={tab === 'print'} onClick={() => setTab('print')}>
            Print &amp; calibration
          </TabButton>
        </div>
      </div>

      {pendingMismatch && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-warn/10 text-xs text-ink">
          {pendingMismatch.kind === 'missing' ? (
            <>
              <span>This project&rsquo;s template &ldquo;{pendingMismatch.embedded.name}&rdquo; isn&rsquo;t in your template library.</span>
              <button className="ml-auto underline hover:no-underline" onClick={() => addEmbeddedAsCustomTemplate()}>
                Add it as a custom template
              </button>
            </>
          ) : (
            <>
              <span>This project&rsquo;s embedded template differs from the library version of &ldquo;{pendingMismatch.library.name}&rdquo;. Keeping the embedded copy so nothing moves.</span>
              <button className="ml-auto underline hover:no-underline" onClick={() => updateToLibraryTemplate()}>
                Update to library version
              </button>
            </>
          )}
          <button className="text-ink-tertiary hover:text-ink" onClick={() => dismissMismatch()}>
            ×
          </button>
        </div>
      )}

      {tab === 'design' && <Editor template={template} />}

      {tab === 'print' && (
        <div className="flex-1 flex min-h-0">
          <aside className="w-80 shrink-0 border-r border-line bg-panel p-4 space-y-6 overflow-y-auto">
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
          <SectionLabel>Print your label</SectionLabel>
          <NumberField
            label={`Start at label (1–${totalSlots})`}
            value={startAtLabel}
            onChange={(v) => setStartAtLabel(Math.min(totalSlots, Math.max(1, Math.round(v))))}
          />
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={showOutlines} onChange={(e) => setShowOutlines(e.target.checked)} />
            Draw label outlines (for a test print on plain paper)
          </label>
          <button
            className="w-full bg-accent/20 hover:bg-accent/30 rounded px-3 py-2 text-sm text-ink border border-accent/40"
            onClick={handleExportLabelSheet}
          >
            Export sheet PDF
          </button>
        </section>

        <section className="space-y-2">
          <SectionLabel>Blank sheets</SectionLabel>
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
      )}
    </div>
  );
}

function EditableDocumentName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function startEditing() {
    setDraft(name);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        className="text-xs text-ink bg-panel-raised border border-accent rounded px-1.5 py-0.5 focus:outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button className="flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink group" onClick={startEditing} title="Rename">
      {name}
      <svg
        viewBox="0 0 16 16"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        className="opacity-0 group-hover:opacity-70"
      >
        <path d="M11.3 2.3a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-7.2 7.2-3 .8.8-3z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`px-2.5 py-1 rounded text-xs ${active ? 'bg-accent/20 text-ink' : 'text-ink-secondary hover:bg-panel-raised'}`}
      onClick={onClick}
    >
      {children}
    </button>
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
