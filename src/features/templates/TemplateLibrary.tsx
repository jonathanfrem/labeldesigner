import { useMemo, useRef, useState } from 'react';
import type { SheetTemplate } from '../../model/types';
import { parseTemplateJson } from '../../lib/templateJson';
import { TemplateDetail } from './TemplateDetail';

export interface TemplateLibraryProps {
  templates: SheetTemplate[];
  onNewCustom: () => void;
  onImport: (template: SheetTemplate) => void;
  onDuplicate: (template: SheetTemplate) => void;
  onUseTemplate: (template: SheetTemplate) => void;
  onGoToCalibration: (template: SheetTemplate) => void;
  onSetVerified: (id: string, verified: boolean) => void;
}

function searchable(t: SheetTemplate): string {
  return [t.name, t.brand ?? '', t.code ?? '', ...(t.equivalents ?? []), `${t.labelWidth}x${t.labelHeight}`]
    .join(' ')
    .toLowerCase();
}

export function TemplateLibrary({
  templates,
  onNewCustom,
  onImport,
  onDuplicate,
  onUseTemplate,
  onGoToCalibration,
  onSetVerified,
}: TemplateLibraryProps) {
  const [query, setQuery] = useState('');
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (unverifiedOnly && t.verified) return false;
      if (q && !searchable(t).includes(q)) return false;
      return true;
    });
  }, [templates, query, unverifiedOnly]);

  const selected = templates.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  async function handleImportFile(file: File) {
    setImportError(null);
    try {
      const text = await file.text();
      const template = parseTemplateJson(text);
      onImport(template);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-72 shrink-0 border-r border-line bg-panel flex flex-col min-h-0">
        <div className="p-3 border-b border-line space-y-2">
          <input
            type="text"
            placeholder="Search brand, code, size…"
            className="w-full bg-panel-raised border border-line rounded px-2 py-1.5 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={unverifiedOnly} onChange={(e) => setUnverifiedOnly(e.target.checked)} />
            Show unverified only
          </label>
        </div>

        <ul className="flex-1 overflow-y-auto">
          {filtered.map((t) => (
            <li key={t.id}>
              <button
                className={`w-full text-left px-3 py-2 border-b border-line text-sm flex items-center justify-between gap-2 ${
                  selected?.id === t.id ? 'bg-panel-raised' : 'hover:bg-panel-raised/60'
                }`}
                onClick={() => setSelectedId(t.id)}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {!t.verified && <span className="text-warn shrink-0">&#9888;</span>}
                  <span className="truncate text-ink">{t.name}</span>
                </span>
                <span className="text-ink-tertiary font-mono text-xs shrink-0">
                  {t.labelWidth}×{t.labelHeight}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-4 text-sm text-ink-tertiary">No templates match.</li>}
        </ul>

        <div className="p-3 border-t border-line space-y-2">
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line"
            onClick={onNewCustom}
          >
            New custom template
          </button>
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line"
            onClick={() => fileInputRef.current?.click()}
          >
            Import template JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          {importError && <p className="text-xs text-danger">{importError}</p>}
        </div>
      </div>

      {selected ? (
        <TemplateDetail
          template={selected}
          onDuplicate={onDuplicate}
          onUseTemplate={onUseTemplate}
          onGoToCalibration={onGoToCalibration}
          onSetVerified={onSetVerified}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-mat text-ink-secondary text-sm">
          No template selected.
        </div>
      )}
    </div>
  );
}
