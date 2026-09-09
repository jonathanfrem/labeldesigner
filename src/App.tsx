import { useState } from 'react';
import type { SheetTemplate } from './model/types';
import { IndexedDbTemplateStorageAdapter } from './storage/indexedDbTemplateStorageAdapter';
import { useTemplateRepository } from './storage/useTemplateRepository';
import { TemplateLibrary } from './features/templates/TemplateLibrary';
import { CustomTemplateEditor } from './features/templates/CustomTemplateEditor';
import { Workbench } from './features/workbench/Workbench';
import { newTemplateId } from './lib/id';

const adapter = new IndexedDbTemplateStorageAdapter();

function defaultCustomTemplate(): SheetTemplate {
  return {
    id: newTemplateId(),
    name: 'New custom template',
    pageSize: { width: 210, height: 297 },
    marginTop: 10,
    marginLeft: 10,
    labelWidth: 50,
    labelHeight: 30,
    columns: 3,
    rows: 8,
    pitchX: 50,
    pitchY: 30,
    shape: 'rect',
    builtIn: false,
    verified: false,
  };
}

type View =
  | { type: 'library' }
  | { type: 'editor'; title: string; draft: SheetTemplate }
  | { type: 'workbench'; template: SheetTemplate; autoOpenCalibration?: boolean };

export default function App() {
  const { allTemplates, saveCustom, setCustomVerified } = useTemplateRepository(adapter);
  const [view, setView] = useState<View>({ type: 'library' });

  function openNewCustom() {
    setView({ type: 'editor', title: 'New custom template', draft: defaultCustomTemplate() });
  }

  function openDuplicate(template: SheetTemplate) {
    setView({
      type: 'editor',
      title: `Duplicate of ${template.name}`,
      draft: {
        ...template,
        id: newTemplateId(),
        name: `${template.name} (copy)`,
        builtIn: false,
        verified: false,
        derivedFrom: template.id,
      },
    });
  }

  function openImported(template: SheetTemplate) {
    setView({ type: 'editor', title: `Imported: ${template.name}`, draft: { ...template, id: newTemplateId() } });
  }

  async function handleSave(template: SheetTemplate) {
    await saveCustom(template);
    setView({ type: 'library' });
  }

  return (
    <div className="h-screen bg-canvas text-ink flex flex-col">
      <header className="shrink-0 h-12 flex items-center px-4 border-b border-line bg-panel">
        <span className="text-sm font-medium text-ink">Label designer</span>
      </header>

      {view.type === 'library' && (
        <TemplateLibrary
          templates={allTemplates}
          onNewCustom={openNewCustom}
          onImport={openImported}
          onDuplicate={openDuplicate}
          onUseTemplate={(t) => setView({ type: 'workbench', template: t })}
          onGoToCalibration={(t) => setView({ type: 'workbench', template: t, autoOpenCalibration: true })}
          onSetVerified={setCustomVerified}
        />
      )}

      {view.type === 'editor' && (
        <CustomTemplateEditor
          title={view.title}
          initial={view.draft}
          onSave={handleSave}
          onCancel={() => setView({ type: 'library' })}
        />
      )}

      {view.type === 'workbench' && (
        <Workbench
          template={view.template}
          autoOpenCalibration={view.autoOpenCalibration}
          onBack={() => setView({ type: 'library' })}
        />
      )}
    </div>
  );
}
