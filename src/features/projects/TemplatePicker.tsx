import { useMemo, useState } from 'react';
import type { SheetTemplate } from '../../model/types';

export interface TemplatePickerProps {
  templates: SheetTemplate[];
  onSelect: (template: SheetTemplate) => void;
  onBack: () => void;
}

function searchable(t: SheetTemplate): string {
  return [t.name, t.brand ?? '', t.code ?? '', ...(t.equivalents ?? []), `${t.labelWidth}x${t.labelHeight}`]
    .join(' ')
    .toLowerCase();
}

/**
 * A lightweight "pick one" list for the New project flow — deliberately not
 * the full TemplateLibrary browser (no detail pane, import, duplicate or
 * verify controls); those stay in the Templates catalogue screen.
 */
export function TemplatePicker({ templates, onSelect, onBack }: TemplatePickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => searchable(t).includes(q));
  }, [templates, query]);

  return (
    <div className="w-full max-w-xl mx-auto space-y-3">
      <input
        type="text"
        autoFocus
        placeholder="Search brand, code, size…"
        className="w-full bg-panel-raised border border-line rounded px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="max-h-96 overflow-y-auto border border-line rounded divide-y divide-line">
        {filtered.map((t) => (
          <li key={t.id}>
            <button
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-panel-raised flex items-center justify-between gap-2"
              onClick={() => onSelect(t)}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {!t.verified && <span className="text-warn shrink-0">&#9888;</span>}
                <span className="truncate text-ink">{t.name}</span>
              </span>
              <span className="text-ink-tertiary font-mono text-xs shrink-0">
                {t.labelWidth}&times;{t.labelHeight}
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-3 py-4 text-sm text-ink-tertiary">No templates match.</li>}
      </ul>

      <button className="text-xs text-ink-secondary hover:text-ink" onClick={onBack}>
        &larr; Back
      </button>
    </div>
  );
}
