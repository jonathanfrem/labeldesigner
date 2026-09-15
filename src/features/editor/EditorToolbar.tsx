import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { ContentRotation } from '../../model/types';
import { useDocumentStore } from '../../state/documentStore';
import { useUiStore } from '../../state/uiStore';
import { useProjectSessionContext } from '../../state/projectSessionContext';
import { resolveSafeMarginMm } from './overlayGeometry';
import { formatNumber, parseLocaleNumber } from '../../lib/number';

const ZOOM_STEP = 0.25;
const ROTATION_CYCLE: Record<ContentRotation, ContentRotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };

export function EditorToolbar() {
  const temporal = useStore(useDocumentStore.temporal);
  const zoom = useUiStore((s) => s.zoom);
  const setZoom = useUiStore((s) => s.setZoom);
  const showSafeArea = useUiStore((s) => s.showSafeArea);
  const showBleed = useUiStore((s) => s.showBleed);
  const toggleSafeArea = useUiStore((s) => s.toggleSafeArea);
  const toggleBleed = useUiStore((s) => s.toggleBleed);
  const contentRotation = useDocumentStore((s) => s.document.contentRotation);
  const setContentRotation = useDocumentStore((s) => s.setContentRotation);
  const safeMarginMm = useDocumentStore((s) => resolveSafeMarginMm(s.document.template));
  const setSafeMarginMm = useDocumentStore((s) => s.setSafeMarginMm);
  const { save, saveToRemote, isDirty, hasFileHandle, remote, canSaveToRemote, isSaving, saveError } =
    useProjectSessionContext();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-line bg-panel text-xs">
      <div className="flex items-center gap-1">
        <ToolbarButton title="Undo (Ctrl+Z)" disabled={temporal.pastStates.length === 0} onClick={() => temporal.undo()}>
          Undo
        </ToolbarButton>
        <ToolbarButton title="Redo (Ctrl+Shift+Z)" disabled={temporal.futureStates.length === 0} onClick={() => temporal.redo()}>
          Redo
        </ToolbarButton>
      </div>

      <div className="w-px h-4 bg-line" />

      <div className="flex items-center gap-1">
        <ToolbarButton title="Zoom out" onClick={() => setZoom(zoom - ZOOM_STEP)}>
          −
        </ToolbarButton>
        <span className="w-12 text-center text-ink-secondary tabular-nums">{Math.round(zoom * 100)}%</span>
        <ToolbarButton title="Zoom in" onClick={() => setZoom(zoom + ZOOM_STEP)}>
          +
        </ToolbarButton>
      </div>

      <div className="w-px h-4 bg-line" />

      <ToolbarButton
        title="Rotate the artwork within the die-cut — the die-cut itself never moves"
        onClick={() => setContentRotation(ROTATION_CYCLE[contentRotation])}
      >
        ⟳ Canvas {contentRotation}°
      </ToolbarButton>

      <div className="w-px h-4 bg-line" />

      <label className="flex items-center gap-1.5 text-ink-secondary">
        <input type="checkbox" checked={showSafeArea} onChange={toggleSafeArea} />
        Safe area
      </label>
      {showSafeArea && <SafeMarginField value={safeMarginMm} onChange={setSafeMarginMm} />}
      <label className="flex items-center gap-1.5 text-ink-secondary">
        <input type="checkbox" checked={showBleed} onChange={toggleBleed} />
        Bleed
      </label>

      <div className="ml-auto flex items-center gap-2">
        {saveError && (
          <span className="text-danger max-w-xs truncate" title={saveError}>
            {saveError}
          </span>
        )}
        <span className="text-ink-tertiary">{saveStatusLabel({ isSaving, isDirty, hasRemote: remote !== null })}</span>
        {/* First commit for a project that isn't linked yet — afterwards Save covers it. */}
        {remote === null && canSaveToRemote && (
          <ToolbarButton title="Save this project to the connected GitHub repository" disabled={isSaving} onClick={() => saveToRemote()}>
            Save to GitHub
          </ToolbarButton>
        )}
        <ToolbarButton title={saveButtonTitle(remote !== null)} disabled={!isDirty || isSaving} onClick={() => save()}>
          {saveButtonLabel({ isSaving, hasRemote: remote !== null, hasFileHandle })}
        </ToolbarButton>
      </div>
    </div>
  );
}

/**
 * The save button names its destination, because where Ctrl+S writes is now a real
 * question — a project can be linked to a repo, a file on disk, both, or neither.
 */
function saveButtonLabel({
  isSaving,
  hasRemote,
  hasFileHandle,
}: {
  isSaving: boolean;
  hasRemote: boolean;
  hasFileHandle: boolean;
}): string {
  if (isSaving) return 'Saving…';
  if (hasRemote) return hasFileHandle ? 'Save both' : 'Save to GitHub';
  return hasFileHandle ? 'Save' : 'Save As…';
}

function saveButtonTitle(hasRemote: boolean): string {
  return hasRemote ? 'Save to GitHub and any linked file (Ctrl+S)' : 'Save (Ctrl+S)';
}

function saveStatusLabel({
  isSaving,
  isDirty,
  hasRemote,
}: {
  isSaving: boolean;
  isDirty: boolean;
  hasRemote: boolean;
}): string {
  if (isSaving) return 'Saving…';
  if (isDirty) return 'Unsaved changes';
  return hasRemote ? 'Saved to GitHub' : 'Saved';
}

function SafeMarginField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(() => formatNumber(value));

  useEffect(() => {
    setText((prev) => (parseLocaleNumber(prev) === value ? prev : formatNumber(value)));
  }, [value]);

  function handleChange(raw: string) {
    setText(raw);
    const parsed = parseLocaleNumber(raw);
    if (!Number.isNaN(parsed) && parsed >= 0) onChange(parsed);
  }

  return (
    <label className="flex items-center gap-1.5 text-ink-secondary" title="Safe-print margin for this template, editable per document">
      Safe margin
      <input
        type="text"
        inputMode="decimal"
        className="w-12 bg-panel-raised border border-line rounded px-1.5 py-1 text-sm font-mono tabular-nums text-ink focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setText(formatNumber(value))}
      />
      mm
    </label>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="px-2 py-1 rounded border border-line bg-panel-raised text-ink hover:bg-line disabled:opacity-40 disabled:hover:bg-panel-raised"
    >
      {children}
    </button>
  );
}
