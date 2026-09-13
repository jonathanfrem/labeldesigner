import { useMemo, useState } from 'react';
import type { StoredProject } from '../../storage/projectStorageAdapter';

export interface ProjectLibraryProps {
  projects: StoredProject[];
  loading: boolean;
  onOpen: (project: StoredProject) => void;
  onOpenFromFile: () => Promise<void>;
  onDelete: (id: string) => void;
  onNewFromTemplate: () => void;
  onBack: () => void;
}

function formatUpdatedAt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ProjectLibrary({ projects, loading, onOpen, onOpenFromFile, onDelete, onNewFromTemplate, onBack }: ProjectLibraryProps) {
  const [query, setQuery] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.document.template.name.toLowerCase().includes(q));
  }, [projects, query]);

  async function handleOpenFromFile() {
    setOpenError(null);
    try {
      await onOpenFromFile();
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not open that file.');
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-72 shrink-0 border-r border-line bg-panel flex flex-col min-h-0">
        <div className="p-3 border-b border-line space-y-2">
          <button className="text-xs text-ink-secondary hover:text-ink" onClick={onBack}>
            &larr; Back
          </button>
          <input
            type="text"
            placeholder="Search projects…"
            className="w-full bg-panel-raised border border-line rounded px-2 py-1.5 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <ul className="flex-1 overflow-y-auto">
          {loading && <li className="px-3 py-4 text-sm text-ink-tertiary">Loading…</li>}
          {!loading &&
            filtered.map((p) => (
              <li key={p.id}>
                <button
                  className="w-full text-left px-3 py-2 border-b border-line text-sm hover:bg-panel-raised/60 flex flex-col gap-0.5"
                  onClick={() => onOpen(p)}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-ink">{p.name || 'Untitled project'}</span>
                    {p.fileHandle && (
                      <span className="text-ink-tertiary shrink-0" title="Linked to a file on disk">
                        &#128190;
                      </span>
                    )}
                  </span>
                  <span className="text-ink-tertiary text-xs">
                    {p.document.template.name} &middot; {formatUpdatedAt(p.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          {!loading && filtered.length === 0 && <li className="px-3 py-4 text-sm text-ink-tertiary">No saved projects yet.</li>}
        </ul>

        <div className="p-3 border-t border-line space-y-2">
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line"
            onClick={onNewFromTemplate}
          >
            New project from template
          </button>
          <button className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line" onClick={handleOpenFromFile}>
            Open project file&hellip;
          </button>
          {openError && <p className="text-xs text-danger">{openError}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {filtered.length > 0 ? (
          <ul className="flex-1 overflow-y-auto divide-y divide-line">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm text-ink">{p.name || 'Untitled project'}</div>
                  <div className="text-xs text-ink-tertiary">
                    {p.document.template.name} &middot; {p.document.elements.length} elements &middot; updated{' '}
                    {formatUpdatedAt(p.updatedAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="bg-panel-raised hover:bg-line rounded px-3 py-1.5 text-sm border border-line text-ink" onClick={() => onOpen(p)}>
                    Open
                  </button>
                  <button
                    className="text-danger hover:underline text-sm px-2"
                    onClick={() => {
                      if (window.confirm(`Delete "${p.name || 'Untitled project'}"? This can't be undone.`)) onDelete(p.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !loading && (
            <div className="flex-1 flex items-center justify-center bg-mat text-ink-secondary text-sm">
              No projects yet — start one from a template or open a saved file.
            </div>
          )
        )}
      </div>
    </div>
  );
}
