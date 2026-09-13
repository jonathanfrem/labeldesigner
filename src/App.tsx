import { useMemo, useState } from 'react';
import type { SheetTemplate } from './model/types';
import { IndexedDbTemplateStorageAdapter } from './storage/indexedDbTemplateStorageAdapter';
import { IndexedDbProjectStorageAdapter } from './storage/indexedDbProjectStorageAdapter';
import { useTemplateRepository } from './storage/useTemplateRepository';
import { useProjectRepository } from './storage/useProjectRepository';
import type { StoredProject } from './storage/projectStorageAdapter';
import { useProjectSession } from './state/projectSession';
import { ProjectSessionContext } from './state/projectSessionContext';
import { AboutPanel } from './features/about/AboutPanel';
import { TemplateLibrary } from './features/templates/TemplateLibrary';
import { CustomTemplateEditor } from './features/templates/CustomTemplateEditor';
import { Workbench } from './features/workbench/Workbench';
import { ProjectLibrary } from './features/projects/ProjectLibrary';
import { newTemplateId } from './lib/id';

const adapter = new IndexedDbTemplateStorageAdapter();
const projectAdapter = new IndexedDbProjectStorageAdapter();

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
  | { type: 'workbench'; template: SheetTemplate; autoOpenCalibration?: boolean }
  | { type: 'projects' };

export default function App() {
  const { allTemplates, saveCustom, setCustomVerified } = useTemplateRepository(adapter);
  const { projects, loading: projectsLoading, removeProject, refresh: refreshProjects } = useProjectRepository(projectAdapter);
  const [view, setView] = useState<View>({ type: 'library' });
  const [showAbout, setShowAbout] = useState(false);

  const resolveTemplate = useMemo(() => (id: string) => allTemplates.find((t) => t.id === id), [allTemplates]);
  const session = useProjectSession(projectAdapter, resolveTemplate, saveCustom);

  /** Guards navigation away from an unsaved workbench — a solo-user tool doesn't need more than a native confirm. */
  function goTo(next: View) {
    if (view.type === 'workbench' && session.isDirty) {
      if (!window.confirm('You have unsaved changes. Leave without saving?')) return;
    }
    if (next.type === 'projects') refreshProjects();
    setView(next);
  }

  function handleUseTemplate(template: SheetTemplate, autoOpenCalibration?: boolean) {
    session.newProject(template);
    goTo({ type: 'workbench', template, autoOpenCalibration });
  }

  function handleOpenProject(stored: StoredProject) {
    session.openFromLibrary(stored);
    goTo({ type: 'workbench', template: stored.document.template });
  }

  async function handleOpenFromFile() {
    const doc = await session.openFromFile();
    if (!doc) return; // user cancelled the picker
    goTo({ type: 'workbench', template: doc.template });
  }

  async function handleDeleteProject(id: string) {
    await removeProject(id);
  }

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
    <ProjectSessionContext.Provider value={session}>
      <div className="h-screen bg-canvas text-ink flex flex-col">
        <header className="shrink-0 h-12 flex items-center px-4 border-b border-line bg-panel gap-3">
          <span className="text-sm font-medium text-ink">Label designer</span>
          <button className="ml-auto text-xs text-ink-tertiary hover:text-ink" onClick={() => goTo({ type: 'projects' })}>
            My projects
          </button>
          <button className="text-xs text-ink-tertiary hover:text-ink" onClick={() => setShowAbout(true)}>
            About &amp; licences
          </button>
        </header>

        {showAbout && <AboutPanel onClose={() => setShowAbout(false)} />}

        {view.type === 'library' && (
          <TemplateLibrary
            templates={allTemplates}
            onNewCustom={openNewCustom}
            onImport={openImported}
            onDuplicate={openDuplicate}
            onUseTemplate={(t) => handleUseTemplate(t)}
            onGoToCalibration={(t) => handleUseTemplate(t, true)}
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

        {view.type === 'projects' && (
          <ProjectLibrary
            projects={projects}
            loading={projectsLoading}
            onOpen={handleOpenProject}
            onOpenFromFile={handleOpenFromFile}
            onDelete={handleDeleteProject}
            onNewFromTemplate={() => goTo({ type: 'library' })}
            onBack={() => goTo({ type: 'library' })}
          />
        )}

        {view.type === 'workbench' && (
          <Workbench template={view.template} autoOpenCalibration={view.autoOpenCalibration} onBack={() => goTo({ type: 'library' })} />
        )}
      </div>
    </ProjectSessionContext.Provider>
  );
}
