import { FONT_CATALOG, fontFamilies, variantsForFamily } from '../../text/fontCatalog';

export interface AboutPanelProps {
  onClose: () => void;
}

/** Surfaces every bundled font's licence (CLAUDE.md invariant 9) — the full OFL text lives in fonts/LICENSES.md. */
export function AboutPanel({ onClose }: AboutPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[32rem] max-h-[80vh] overflow-y-auto bg-panel border border-line rounded-lg p-5 text-sm text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">About &amp; licences</h2>
          <button className="text-ink-tertiary hover:text-ink" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="text-ink-secondary mb-4">
          Label designer runs entirely in your browser — no accounts, no server, no telemetry. Every font below is bundled with the app
          and embedded directly into exported PDFs.
        </p>

        <h3 className="text-xs font-medium text-ink-secondary mb-2 pl-2 border-l-2 border-line-strong">Bundled fonts</h3>
        <div className="space-y-3">
          {fontFamilies().map((family) => (
            <div key={family} className="flex items-center justify-between border-b border-line/50 pb-2">
              <div>
                <div className="text-ink">{family}</div>
                <div className="text-ink-tertiary text-[11px]">
                  {variantsForFamily(family)
                    .map((v) => (v.weight === 'bold' ? 'Bold' : 'Regular'))
                    .join(', ')}
                </div>
              </div>
              <span className="text-ink-tertiary text-[11px] font-mono">{FONT_CATALOG.find((f) => f.family === family)!.licence}</span>
            </div>
          ))}
        </div>
        <p className="text-ink-tertiary text-[11px] mt-3">
          Full licence text and copyright notices: <code className="font-mono">fonts/LICENSES.md</code> in the project repository.
        </p>
      </div>
    </div>
  );
}
