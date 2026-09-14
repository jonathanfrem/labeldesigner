import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SheetTemplate } from './model/types';
import { useGithubCloud } from './cloud/github/useGithubCloud';
import { listRemoteProjects, type RemoteProjectSummary } from './cloud/github/githubProjectSync';
import { ConflictDialog } from './features/cloud/ConflictDialog';
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
import { NewProjectFlow } from './features/projects/NewProjectFlow';
import { newTemplateId } from './lib/id';
import { defaultCustomTemplate } from './lib/defaultTemplate';

const adapter = new IndexedDbTemplateStorageAdapter();
const projectAdapter = new IndexedDbProjectStorageAdapter();

type View =
  | { type: 'library' }
  | { type: 'editor'; title: string; draft: SheetTemplate }
  | { type: 'workbench'; template: SheetTemplate; autoOpenCalibration?: boolean }
  | { type: 'projects' }
  | { type: 'newProject' };

export default function App() {
  const { allTemplates, saveCustom, setCustomVerified } = useTemplateRepository(adapter);
  const { projects, loading: projectsLoading, removeProject, refresh: refreshProjects } = useProjectRepository(projectAdapter);
  const [view, setView] = useState<View>({ type: 'projects' });
  const [showAbout, setShowAbout] = useState(false);

  const cloud = useGithubCloud();
  const [remoteProjects, setRemoteProjects] = useState<RemoteProjectSummary[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const resolveTemplate = useMemo(() => (id: string) => allTemplates.find((t) => t.id === id), [allTemplates]);
  const session = useProjectSession(projectAdapter, resolveTemplate, saveCustom, cloud);

  const reloadRemote = useCallback(async () => {
    const { client, repo } = cloud;
    if (!client || !repo) {
      setRemoteProjects([]);
      return;
    }
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      setRemoteProjects(await listRemoteProjects(client, repo));
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : 'Could not list projects on GitHub.');
    } finally {
      setRemoteLoading(false);
    }
  }, [cloud]);

  // Keyed on the repo rather than on `cloud`, whose identity changes on every render.
  const repoKey = cloud.repo ? `${cloud.repo.owner}/${cloud.repo.repo}` : '';
  useEffect(() => {
    if (repoKey) reloadRemote();
    else setRemoteProjects([]);
    // reloadRemote closes over `cloud` and would re-run constantly; the repo is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoKey]);

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

  async function handleOpenRemote(path: string) {
    const doc = await session.openFromRemote(path);
    goTo({ type: 'workbench', template: doc.template });
  }

  /** Loading the repo's version replaces the open document in place — stay in the workbench. */
  function handleTakeRemote() {
    session.resolveConflictTakeRemote();
  }

  async function handleDeleteProject(id: string) {
    await removeProject(id);
  }

  function handleCreateWithTemplate(name: string, template: SheetTemplate) {
    session.newProject(template, name || undefined);
    goTo({ type: 'workbench', template });
  }

  async function handleCreateWithCustomTemplate(name: string, template: SheetTemplate) {
    await saveCustom(template);
    session.newProject(template, name || undefined);
    goTo({ type: 'workbench', template });
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
          <button className="text-xs text-ink-tertiary hover:text-ink" onClick={() => goTo({ type: 'library' })}>
            Templates
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
            onNewProject={() => goTo({ type: 'newProject' })}
            cloud={cloud}
            remoteProjects={remoteProjects}
            remoteLoading={remoteLoading}
            remoteError={remoteError}
            onOpenRemote={handleOpenRemote}
            onReloadRemote={reloadRemote}
          />
        )}

        {view.type === 'newProject' && (
          <NewProjectFlow
            templates={allTemplates}
            onCreateWithTemplate={handleCreateWithTemplate}
            onCreateWithCustomTemplate={handleCreateWithCustomTemplate}
            onCancel={() => goTo({ type: 'projects' })}
          />
        )}

        {view.type === 'workbench' && (
          <Workbench template={view.template} autoOpenCalibration={view.autoOpenCalibration} />
        )}

        {session.pendingConflict && (
          <ConflictDialog
            conflict={session.pendingConflict}
            busy={session.isSaving}
            onOverwrite={session.resolveConflictOverwrite}
            onTakeRemote={handleTakeRemote}
            onCancel={session.dismissConflict}
          />
        )}
      </div>
    </ProjectSessionContext.Provider>
  );
}
