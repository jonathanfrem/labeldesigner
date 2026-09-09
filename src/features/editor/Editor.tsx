import { useEffect } from 'react';
import type { SheetTemplate } from '../../model/types';
import { resetDocumentHistory, useDocumentStore } from '../../state/documentStore';
import { EditorToolbar } from './EditorToolbar';
import { LabelCanvas } from './LabelCanvas';
import { LayersPanel } from './LayersPanel';
import { PropertiesPanel } from './PropertiesPanel';

export interface EditorProps {
  template: SheetTemplate;
}

/**
 * The label canvas is the primary surface here (PLAN §9): layers on the
 * left, the canvas centred and scrollable, properties on the right, with a
 * thin toolbar above for zoom/undo/overlay toggles. This view lives inside
 * the Workbench as a "Design" tab alongside the existing print/calibration
 * tools, rather than replacing them.
 */
export function Editor({ template }: EditorProps) {
  const loadTemplate = useDocumentStore((s) => s.loadTemplate);
  const documentTemplateId = useDocumentStore((s) => s.document.templateId);

  useEffect(() => {
    if (documentTemplateId !== template.id) {
      loadTemplate(template);
      resetDocumentHistory();
    }
    // Only re-run when the template identity actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <EditorToolbar />
      <div className="flex-1 flex min-h-0">
        <aside className="w-56 shrink-0 border-r border-line bg-panel overflow-y-auto">
          <LayersPanel />
        </aside>
        <main className="flex-1 overflow-auto bg-mat flex items-center justify-center p-8">
          <LabelCanvas />
        </main>
        <aside className="w-72 shrink-0 border-l border-line bg-panel overflow-y-auto">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}
