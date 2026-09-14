import { useDocumentStore } from '../../state/documentStore';
import type { RemoteConflict } from '../../state/projectSession';

export interface ConflictDialogProps {
  conflict: RemoteConflict;
  busy: boolean;
  onOverwrite: () => void;
  onTakeRemote: () => void;
  onCancel: () => void;
}

/**
 * Shown when a save was refused because the file changed on GitHub since it was opened
 * (PLAN §2.7).
 *
 * Deliberately offers no merge. A label document is geometry, not text — a three-way merge
 * would produce a plausible-looking file with elements at coordinates neither version ever
 * had, and the user would only find out at print time. Choosing a whole version is the only
 * honest option, so both are described concretely enough to choose between.
 */
export function ConflictDialog({ conflict, busy, onOverwrite, onTakeRemote, onCancel }: ConflictDialogProps) {
  const localCount = useDocumentStore((s) => s.document.elements.length);
  const remoteCount = conflict.remote.elements.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-panel border border-line rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
        <h2 className="text-sm font-medium text-ink">This project changed on GitHub</h2>
        <p className="text-sm text-ink-secondary">
          <code className="text-xs text-ink-tertiary">{conflict.link.path}</code> was updated in the repository after you
          opened it, so your save was refused rather than overwriting that change.
        </p>
        <p className="text-sm text-ink-secondary">
          The version on GitHub is named &ldquo;{conflict.remote.name || 'Untitled project'}&rdquo; and has {remoteCount}{' '}
          element{remoteCount === 1 ? '' : 's'}. Yours has {localCount} element{localCount === 1 ? '' : 's'}.
        </p>
        <p className="text-xs text-ink-tertiary">
          There is no merge — a label is geometry, and a merged file would place elements where neither version had them.
        </p>

        <div className="flex flex-col gap-2 pt-1">
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line disabled:opacity-50"
            onClick={onOverwrite}
            disabled={busy}
          >
            Keep mine — overwrite GitHub
          </button>
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line disabled:opacity-50"
            onClick={onTakeRemote}
            disabled={busy}
          >
            Discard mine — load the GitHub version
          </button>
          <button className="text-ink-tertiary hover:text-ink text-sm px-2 py-1" onClick={onCancel} disabled={busy}>
            Cancel, decide later
          </button>
        </div>
      </div>
    </div>
  );
}
