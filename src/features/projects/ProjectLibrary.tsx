import { useMemo, useState } from 'react';
import type { StoredProject } from '../../storage/projectStorageAdapter';
import type { RemoteProjectSummary } from '../../cloud/github/githubProjectSync';
import type { GithubCloudApi } from '../../cloud/github/useGithubCloud';
import { GithubPanel } from '../cloud/GithubPanel';

export interface ProjectLibraryProps {
  projects: StoredProject[];
  loading: boolean;
  /** Set when loading failed rather than just being slow — e.g. a blocked IndexedDB upgrade. */
  error: string | null;
  onOpen: (project: StoredProject) => void;
  onOpenFromFile: () => Promise<void>;
  onDelete: (project: StoredProject) => Promise<void>;
  onDeleteRemote: (remote: RemoteProjectSummary) => Promise<void>;
  onNewProject: () => void;
  cloud: GithubCloudApi;
  remoteProjects: RemoteProjectSummary[];
  remoteLoading: boolean;
  remoteError: string | null;
  onOpenRemote: (path: string) => Promise<void>;
  onReloadRemote: () => void;
}

type Tab = 'projects' | 'github';

/** A single row in the merged list — either a project already on this device, or one that only exists on GitHub so far. */
type ProjectEntry = { kind: 'local'; project: StoredProject } | { kind: 'remote'; remote: RemoteProjectSummary };

function formatUpdatedAt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ProjectLibrary({
  projects,
  loading,
  error,
  onOpen,
  onOpenFromFile,
  onDelete,
  onDeleteRemote,
  onNewProject,
  cloud,
  remoteProjects,
  remoteLoading,
  remoteError,
  onOpenRemote,
  onReloadRemote,
}: ProjectLibraryProps) {
  const [tab, setTab] = useState<Tab>('projects');
  const [query, setQuery] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);

  const cloudConnected = Boolean(cloud.repo && cloud.session);

  /** Remote projects not yet opened on this device — already-linked ones are shown via their local entry's cloud badge instead. */
  const remoteOnly = useMemo(() => {
    const linkedPaths = new Set(projects.filter((p) => p.remote).map((p) => p.remote!.path));
    return remoteProjects.filter((r) => !linkedPaths.has(r.path));
  }, [remoteProjects, projects]);

  const entries: ProjectEntry[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local: ProjectEntry[] = projects
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.document.template.name.toLowerCase().includes(q))
      .map((project) => ({ kind: 'local', project }));
    const remote: ProjectEntry[] = remoteOnly
      .filter((r) => !q || r.displayName.toLowerCase().includes(q))
      .map((remote) => ({ kind: 'remote', remote }));
    return [...local, ...remote];
  }, [projects, remoteOnly, query]);

  async function handleOpenFromFile() {
    setOpenError(null);
    try {
      await onOpenFromFile();
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not open that file.');
    }
  }

  async function handleOpenRemote(path: string) {
    setOpenError(null);
    try {
      await onOpenRemote(path);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not open that project from GitHub.');
    }
  }

  async function handleDeleteLocal(project: StoredProject) {
    const name = project.name || 'Untitled project';
    const message = project.remote
      ? `Delete "${name}"? This removes it from this device and from ${project.remote.owner}/${project.remote.repo} on GitHub. This can't be undone.`
      : `Delete "${name}"? This can't be undone.`;
    if (!window.confirm(message)) return;
    setOpenError(null);
    try {
      await onDelete(project);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not delete that project.');
    }
  }

  async function handleDeleteRemote(remote: RemoteProjectSummary) {
    if (!window.confirm(`Delete "${remote.displayName}" from GitHub? This can't be undone.`)) return;
    setOpenError(null);
    try {
      await onDeleteRemote(remote);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Could not delete that project from GitHub.');
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col min-h-0 py-8 px-4">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h1 className="text-lg font-medium text-ink">My projects</h1>
          <div className="flex gap-2">
            <button
              className="bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line"
              onClick={handleOpenFromFile}
            >
              Open project file&hellip;
            </button>
            <button className="bg-accent hover:bg-accent/90 text-white rounded px-3 py-2 text-sm font-medium" onClick={onNewProject}>
              New project
            </button>
          </div>
        </div>

        {openError && <p className="text-xs text-danger mb-3">{openError}</p>}

        <div className="flex items-center gap-1 border-b border-line mb-4">
          <button
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === 'projects' ? 'border-accent text-ink' : 'border-transparent text-ink-tertiary hover:text-ink'
            }`}
            onClick={() => setTab('projects')}
          >
            Projects
          </button>
          <button
            className={`px-3 py-2 text-sm border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === 'github' ? 'border-accent text-ink' : 'border-transparent text-ink-tertiary hover:text-ink'
            }`}
            onClick={() => setTab('github')}
          >
            GitHub
            {cloud.session && (
              <img src={cloud.session.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
            )}
          </button>
        </div>

        {tab === 'projects' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <input
              type="text"
              placeholder="Search projects…"
              className="w-full bg-panel-raised border border-line rounded px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent mb-4"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            {cloudConnected && (
              <div className="flex items-center gap-2 mb-2 text-xs text-ink-tertiary">
                <span className="uppercase tracking-wide truncate flex-1">
                  Cloud projects from {cloud.repo!.owner}/{cloud.repo!.repo}
                </span>
                <button className="hover:text-ink" onClick={onReloadRemote} title="Reload from GitHub">
                  Refresh
                </button>
              </div>
            )}

            <div className="border border-line rounded-lg bg-panel overflow-hidden">
              {loading && !error && <div className="px-4 py-4 text-sm text-ink-tertiary">Loading…</div>}
              {error && (
                <div className="px-4 py-4 text-sm space-y-2">
                  <p className="text-danger">{error}</p>
                  <button
                    className="bg-panel-raised hover:bg-line rounded px-2 py-1 text-xs text-ink border border-line"
                    onClick={() => window.location.reload()}
                  >
                    Reload
                  </button>
                </div>
              )}
              {!loading && !error && remoteLoading && cloudConnected && (
                <div className="px-4 py-2 text-xs text-ink-tertiary border-b border-line">Loading from GitHub…</div>
              )}
              {remoteError && <div className="px-4 py-2 text-xs text-danger border-b border-line">{remoteError}</div>}
              {!loading && !error && entries.length > 0 && (
                <ul className="divide-y divide-line">
                  {entries.map((entry) =>
                    entry.kind === 'local' ? (
                      <li key={`local:${entry.project.id}`} className="flex items-center justify-between px-4 py-3 gap-3">
                        <button className="flex-1 min-w-0 text-left" onClick={() => onOpen(entry.project)}>
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-sm text-ink">{entry.project.name || 'Untitled project'}</span>
                            {entry.project.fileHandle && (
                              <span className="text-ink-tertiary shrink-0" title="Linked to a file on disk">
                                &#128190;
                              </span>
                            )}
                            {entry.project.remote && (
                              <span
                                className="text-ink-tertiary shrink-0"
                                title={`Synced to ${entry.project.remote.owner}/${entry.project.remote.repo}`}
                              >
                                &#9729;
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-ink-tertiary">
                            {entry.project.document.template.name} &middot; updated {formatUpdatedAt(entry.project.updatedAt)}
                          </span>
                        </button>
                        <div className="flex gap-2 shrink-0">
                          <button
                            className="bg-panel-raised hover:bg-line rounded px-3 py-1.5 text-sm border border-line text-ink"
                            onClick={() => onOpen(entry.project)}
                          >
                            Open
                          </button>
                          <button
                            className="text-danger hover:underline text-sm px-2"
                            onClick={() => handleDeleteLocal(entry.project)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ) : (
                      <li key={`remote:${entry.remote.path}`} className="flex items-center justify-between px-4 py-3 gap-3">
                        <button className="flex-1 min-w-0 text-left" onClick={() => handleOpenRemote(entry.remote.path)}>
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-sm text-ink">{entry.remote.displayName}</span>
                            <span className="text-ink-tertiary shrink-0" title="Only on GitHub — opening will download it">
                              &#9729;
                            </span>
                          </span>
                          <span className="block text-xs text-ink-tertiary">Not yet on this device</span>
                        </button>
                        <div className="flex gap-2 shrink-0">
                          <button
                            className="bg-panel-raised hover:bg-line rounded px-3 py-1.5 text-sm border border-line text-ink"
                            onClick={() => handleOpenRemote(entry.remote.path)}
                          >
                            Open
                          </button>
                          <button
                            className="text-danger hover:underline text-sm px-2"
                            onClick={() => handleDeleteRemote(entry.remote)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              )}
              {!loading && !error && entries.length === 0 && (
                <div className="px-4 py-4 text-sm text-ink-tertiary">
                  No saved projects yet — start one from a template or open a saved file.
                  {!cloudConnected && (
                    <>
                      {' '}
                      <button className="text-accent hover:underline" onClick={() => setTab('github')}>
                        Connect GitHub
                      </button>{' '}
                      to also see projects saved to a repository.
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'github' && (
          <div className="flex-1 overflow-y-auto">
            <div className="border border-line rounded-lg bg-panel max-w-md">
              <GithubPanel cloud={cloud} onRepoChanged={onReloadRemote} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
