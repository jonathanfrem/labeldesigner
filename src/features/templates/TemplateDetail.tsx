import type { ReactNode } from 'react';
import type { SheetTemplate } from '../../model/types';
import { SheetPreview } from '../../render/svg/SheetPreview';
import { downloadTemplateJson } from '../../lib/templateJson';
import { DerivedGeometryTable } from './DerivedGeometryTable';

export interface TemplateDetailProps {
  template: SheetTemplate;
  onDuplicate: (template: SheetTemplate) => void;
  onUseTemplate: (template: SheetTemplate) => void;
  onGoToCalibration: (template: SheetTemplate) => void;
  onSetVerified: (id: string, verified: boolean) => void;
}

export function TemplateDetail({ template, onDuplicate, onUseTemplate, onGoToCalibration, onSetVerified }: TemplateDetailProps) {
  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex items-center justify-center bg-mat p-8">
        <SheetPreview template={template} className="h-full max-h-[820px] bg-paper shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
      </div>

      <aside className="w-80 shrink-0 border-l border-line bg-panel p-4 space-y-5 overflow-y-auto">
        <section>
          <h2 className="text-[15px] font-medium text-ink">{template.name}</h2>
          {(template.brand || template.code) && (
            <p className="text-xs text-ink-secondary mt-0.5">
              {template.brand}
              {template.brand && template.code ? ' · ' : ''}
              {template.code}
            </p>
          )}
          {template.equivalents && template.equivalents.length > 0 && (
            <p className="text-xs text-ink-tertiary mt-1">Also sold as: {template.equivalents.join(', ')}</p>
          )}

          {template.verified ? (
            <p className="mt-2 text-xs text-ink-secondary flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
              Confirmed by a test print
            </p>
          ) : (
            <div className="mt-2 rounded border border-warn/30 bg-warn/10 px-2 py-1.5">
              <p className="text-xs text-warn">Not yet confirmed by a test print.</p>
              <button
                className="mt-1.5 text-xs text-warn underline underline-offset-2 hover:text-ink"
                onClick={() => onGoToCalibration(template)}
              >
                Go to calibration sheet
              </button>
            </div>
          )}
        </section>

        <section>
          <SectionLabel>Derived geometry</SectionLabel>
          <DerivedGeometryTable template={template} />
        </section>

        {template.source && (
          <section>
            <SectionLabel>Source</SectionLabel>
            <p className="text-xs text-ink-secondary leading-relaxed">{template.source}</p>
          </section>
        )}

        <section className="space-y-2 pt-2 border-t border-line">
          <button
            className="w-full bg-accent hover:bg-accent/90 text-white rounded px-3 py-2 text-sm font-medium"
            onClick={() => onUseTemplate(template)}
          >
            Use this template
          </button>
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line"
            onClick={() => onDuplicate(template)}
          >
            Duplicate and edit
          </button>
          <button
            className="w-full bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line"
            onClick={() => downloadTemplateJson(template)}
          >
            Export as JSON
          </button>
          {!template.builtIn &&
            (template.verified ? (
              <button
                className="w-full text-xs text-ink-tertiary hover:text-ink-secondary underline underline-offset-2"
                onClick={() => onSetVerified(template.id, false)}
              >
                Mark as unverified
              </button>
            ) : (
              <button
                className="w-full text-xs text-ink-secondary hover:text-ink underline underline-offset-2"
                onClick={() => onSetVerified(template.id, true)}
              >
                Mark as verified
              </button>
            ))}
        </section>
      </aside>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-medium text-ink-secondary mb-2 pl-2 border-l-2 border-line-strong">{children}</h3>
  );
}
