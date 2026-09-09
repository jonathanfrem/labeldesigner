import { useStore } from 'zustand';
import { useDocumentStore } from '../../state/documentStore';
import { useUiStore } from '../../state/uiStore';

const ZOOM_STEP = 0.25;

export function EditorToolbar() {
  const temporal = useStore(useDocumentStore.temporal);
  const zoom = useUiStore((s) => s.zoom);
  const setZoom = useUiStore((s) => s.setZoom);
  const showSafeArea = useUiStore((s) => s.showSafeArea);
  const showBleed = useUiStore((s) => s.showBleed);
  const toggleSafeArea = useUiStore((s) => s.toggleSafeArea);
  const toggleBleed = useUiStore((s) => s.toggleBleed);

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

      <label className="flex items-center gap-1.5 text-ink-secondary">
        <input type="checkbox" checked={showSafeArea} onChange={toggleSafeArea} />
        Safe area
      </label>
      <label className="flex items-center gap-1.5 text-ink-secondary">
        <input type="checkbox" checked={showBleed} onChange={toggleBleed} />
        Bleed
      </label>
    </div>
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
