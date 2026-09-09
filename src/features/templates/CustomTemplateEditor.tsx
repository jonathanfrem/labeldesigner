import { useState, type ReactNode } from 'react';
import type { LabelShape, SheetTemplate } from '../../model/types';
import { derivedMargins, fromMarginMode, type MarginModeInput } from '../../model/geometry';
import { newTemplateId } from '../../lib/id';
import { NumberField } from '../../components/NumberField';
import { SheetPreview } from '../../render/svg/SheetPreview';
import { DerivedGeometryTable } from './DerivedGeometryTable';

export interface CustomTemplateEditorProps {
  title: string;
  initial: SheetTemplate;
  onSave: (template: SheetTemplate) => void;
  onCancel: () => void;
}

type Mode = 'pitch' | 'margin';

type GeometryPatch = Partial<
  Pick<
    SheetTemplate,
    'pageSize' | 'marginTop' | 'marginLeft' | 'labelWidth' | 'labelHeight' | 'columns' | 'rows' | 'pitchX' | 'pitchY' | 'shape' | 'cornerRadius'
  >
>;

export function CustomTemplateEditor({ title, initial, onSave, onCancel }: CustomTemplateEditorProps) {
  const [draft, setDraft] = useState<SheetTemplate>(initial);
  const [mode, setMode] = useState<Mode>('pitch');
  const [marginRightDraft, setMarginRightDraft] = useState(() => derivedMargins(initial).marginRight);
  const [marginBottomDraft, setMarginBottomDraft] = useState(() => derivedMargins(initial).marginBottom);
  const [equivalentsText, setEquivalentsText] = useState(() => (initial.equivalents ?? []).join(', '));

  function applyGeometry(patch: GeometryPatch) {
    setDraft((d) => ({ ...d, ...patch, verified: false }));
  }

  function switchMode(next: Mode) {
    if (next === 'margin' && mode !== 'margin') {
      const m = derivedMargins(draft);
      setMarginRightDraft(m.marginRight);
      setMarginBottomDraft(m.marginBottom);
    }
    setMode(next);
  }

  function recomputeFromMargin(overrides: Partial<Omit<MarginModeInput, 'pageSize'>>) {
    const input: MarginModeInput = {
      pageSize: draft.pageSize,
      marginTop: overrides.marginTop ?? draft.marginTop,
      marginLeft: overrides.marginLeft ?? draft.marginLeft,
      marginRight: overrides.marginRight ?? marginRightDraft,
      marginBottom: overrides.marginBottom ?? marginBottomDraft,
      labelWidth: overrides.labelWidth ?? draft.labelWidth,
      labelHeight: overrides.labelHeight ?? draft.labelHeight,
      columns: overrides.columns ?? draft.columns,
      rows: overrides.rows ?? draft.rows,
    };
    const solved = fromMarginMode(input);
    setDraft((d) => ({ ...d, ...solved, verified: false }));
    if (overrides.marginRight !== undefined) setMarginRightDraft(overrides.marginRight);
    if (overrides.marginBottom !== undefined) setMarginBottomDraft(overrides.marginBottom);
  }

  function updateEquivalents(text: string) {
    setEquivalentsText(text);
    const list = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setDraft((d) => ({ ...d, equivalents: list.length > 0 ? list : undefined }));
  }

  const canSave = draft.name.trim() !== '' && draft.labelWidth > 0 && draft.labelHeight > 0 && draft.columns >= 1 && draft.rows >= 1;

  function handleSave() {
    if (!canSave) return;
    onSave({ ...draft, id: draft.id || newTemplateId(), builtIn: false });
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-96 shrink-0 border-r border-line bg-panel p-4 overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <button className="text-xs text-ink-secondary hover:text-ink" onClick={onCancel}>
            Back to library
          </button>
        </div>

        <h2 className="text-[15px] font-medium text-ink">{title}</h2>

        <section className="space-y-2">
          <SectionLabel>Identity</SectionLabel>
          <TextField label="Name" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Brand" value={draft.brand ?? ''} onChange={(v) => setDraft((d) => ({ ...d, brand: v || undefined }))} />
            <TextField label="Code" value={draft.code ?? ''} onChange={(v) => setDraft((d) => ({ ...d, code: v || undefined }))} />
          </div>
          <TextField label="Equivalents (comma-separated)" value={equivalentsText} onChange={updateEquivalents} />
        </section>

        <section className="space-y-2">
          <SectionLabel>Input mode</SectionLabel>
          <div className="flex gap-1 bg-panel-raised rounded p-0.5 border border-line w-fit">
            <ModeButton active={mode === 'pitch'} onClick={() => switchMode('pitch')}>
              Pitch
            </ModeButton>
            <ModeButton active={mode === 'margin'} onClick={() => switchMode('margin')}>
              Margin
            </ModeButton>
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel>Page</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Width"
              suffix="mm"
              value={draft.pageSize.width}
              onChange={(v) => applyGeometry({ pageSize: { ...draft.pageSize, width: v } })}
            />
            <NumberField
              label="Height"
              suffix="mm"
              value={draft.pageSize.height}
              onChange={(v) => applyGeometry({ pageSize: { ...draft.pageSize, height: v } })}
            />
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel>Label and grid</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Label width"
              suffix="mm"
              value={draft.labelWidth}
              onChange={(v) => (mode === 'pitch' ? applyGeometry({ labelWidth: v }) : recomputeFromMargin({ labelWidth: v }))}
            />
            <NumberField
              label="Label height"
              suffix="mm"
              value={draft.labelHeight}
              onChange={(v) => (mode === 'pitch' ? applyGeometry({ labelHeight: v }) : recomputeFromMargin({ labelHeight: v }))}
            />
            <NumberField
              label="Columns"
              value={draft.columns}
              onChange={(v) => (mode === 'pitch' ? applyGeometry({ columns: Math.round(v) }) : recomputeFromMargin({ columns: Math.round(v) }))}
            />
            <NumberField
              label="Rows"
              value={draft.rows}
              onChange={(v) => (mode === 'pitch' ? applyGeometry({ rows: Math.round(v) }) : recomputeFromMargin({ rows: Math.round(v) }))}
            />
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel>{mode === 'pitch' ? 'Margins and pitch' : 'Margins (measured)'}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Margin top"
              suffix="mm"
              value={draft.marginTop}
              onChange={(v) => (mode === 'pitch' ? applyGeometry({ marginTop: v }) : recomputeFromMargin({ marginTop: v }))}
            />
            <NumberField
              label="Margin left"
              suffix="mm"
              value={draft.marginLeft}
              onChange={(v) => (mode === 'pitch' ? applyGeometry({ marginLeft: v }) : recomputeFromMargin({ marginLeft: v }))}
            />
            {mode === 'pitch' ? (
              <>
                <NumberField label="Pitch X" suffix="mm" value={draft.pitchX} onChange={(v) => applyGeometry({ pitchX: v })} />
                <NumberField label="Pitch Y" suffix="mm" value={draft.pitchY} onChange={(v) => applyGeometry({ pitchY: v })} />
              </>
            ) : (
              <>
                <NumberField label="Margin right" suffix="mm" value={marginRightDraft} onChange={(v) => recomputeFromMargin({ marginRight: v })} />
                <NumberField
                  label="Margin bottom"
                  suffix="mm"
                  value={marginBottomDraft}
                  onChange={(v) => recomputeFromMargin({ marginBottom: v })}
                />
              </>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <SectionLabel>Die-cut shape</SectionLabel>
          <div className="flex gap-1 bg-panel-raised rounded p-0.5 border border-line w-fit">
            {(['rect', 'rounded', 'ellipse'] as LabelShape[]).map((shape) => (
              <ModeButton key={shape} active={draft.shape === shape} onClick={() => applyGeometry({ shape })}>
                {shape}
              </ModeButton>
            ))}
          </div>
          {draft.shape === 'rounded' && (
            <NumberField
              label="Corner radius"
              suffix="mm"
              value={draft.cornerRadius ?? 0}
              onChange={(v) => applyGeometry({ cornerRadius: v })}
            />
          )}
        </section>

        <div className="flex gap-2 pt-2 border-t border-line">
          <button
            className="flex-1 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-3 py-2 text-sm font-medium"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save
          </button>
          <button className="flex-1 bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex items-center justify-center bg-mat p-8 min-h-0">
          <SheetPreview template={draft} className="h-full max-h-[720px] bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
        </div>
        <div className="border-t border-line bg-panel p-4">
          <DerivedGeometryTable template={draft} />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <h3 className="text-xs font-medium text-ink-secondary pl-2 border-l-2 border-line-strong">{children}</h3>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-ink-tertiary text-[11px] mb-1">{label}</span>
      <input
        type="text"
        className="w-full bg-panel-raised border border-line rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`px-2.5 py-1 text-xs rounded capitalize ${active ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
