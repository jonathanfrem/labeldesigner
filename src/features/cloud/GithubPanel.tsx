import { useCallback, useEffect, useState } from 'react';
import type { GithubCloudApi } from '../../cloud/github/useGithubCloud';
import type { RepoRef } from '../../cloud/github/types';

export interface GithubPanelProps {
  cloud: GithubCloudApi;
  /** Called after the repo changes, so the caller can reload the remote project list. */
  onRepoChanged: () => void;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong talking to GitHub.';
}

/**
 * Connect/disconnect and repo selection for cloud save (PLAN §2.7).
 *
 * Renders nothing when the server reports no client id — a deployment without the token
 * endpoint must look exactly like the app did before this feature existed, not like a
 * broken version of it.
 */
export function GithubPanel({ cloud, onRepoChanged }: GithubPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [repos, setRepos] = useState<RepoRef[] | null>(null);
  const [newRepoName, setNewRepoName] = useState('label-designer-projects');

  useEffect(() => {
    if (cloud.session) cloud.refreshInstallState().catch(() => undefined);
  }, [cloud]);

  const loadRepos = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRepos(await cloud.listRepos());
      setPicking(true);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }, [cloud]);

  async function handleConnect() {
    setError(null);
    try {
      await cloud.connect();
    } catch (err) {
      setError(describe(err));
    }
  }

  async function handleSelect(repo: RepoRef) {
    await cloud.selectRepo(repo);
    setPicking(false);
    onRepoChanged();
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await handleSelect(await cloud.createRepo(newRepoName.trim()));
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  if (!cloud.available) {
    return (
      <div className="p-4 text-sm text-ink-tertiary">
        Cloud save isn&rsquo;t configured for this deployment — projects stay in this browser only.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {!cloud.session && (
        <>
          <button
            className="w-full bg-accent hover:bg-accent/90 text-white rounded px-3 py-2 text-sm font-medium"
            onClick={handleConnect}
          >
            Connect GitHub
          </button>
          <p className="text-xs text-ink-tertiary">Save projects to a private repository instead of only this browser.</p>
        </>
      )}

      {cloud.session && (
        <>
          <div className="flex items-center gap-2 text-sm text-ink min-w-0">
            <img src={cloud.session.avatarUrl} alt="" className="w-5 h-5 rounded-full shrink-0" />
            <span className="truncate">@{cloud.session.login}</span>
          </div>

          {/* Authorising and installing are separate steps on GitHub's side, and finishing
              only the first leaves an empty repo list with no explanation. */}
          {cloud.needsInstall && (
            <p className="text-xs text-ink-secondary">
              Choose which repositories this app may use:{' '}
              <a className="text-accent hover:underline" href={cloud.installUrl} target="_blank" rel="noreferrer">
                install on GitHub
              </a>
              .
            </p>
          )}

          <div className="text-xs text-ink-secondary truncate">
            {cloud.repo ? `${cloud.repo.owner}/${cloud.repo.repo}` : 'No repository selected'}
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 bg-panel-raised hover:bg-line rounded px-2 py-1.5 text-xs text-ink border border-line disabled:opacity-50"
              onClick={loadRepos}
              disabled={busy}
            >
              {cloud.repo ? 'Change repository' : 'Choose repository'}
            </button>
            <button className="text-ink-tertiary hover:text-ink text-xs px-2" onClick={() => cloud.disconnect()}>
              Disconnect
            </button>
          </div>

          {picking && (
            <div className="space-y-2 border border-line rounded p-2 bg-panel-raised">
              <ul className="max-h-40 overflow-y-auto">
                {repos?.map((r) => (
                  <li key={`${r.owner}/${r.repo}`}>
                    <button
                      className="w-full text-left px-2 py-1 text-xs text-ink hover:bg-line rounded truncate"
                      onClick={() => handleSelect(r)}
                    >
                      {r.owner}/{r.repo}
                      {!r.private && <span className="text-danger ml-1">(public)</span>}
                    </button>
                  </li>
                ))}
                {repos?.length === 0 && (
                  <li className="px-2 py-1 text-xs text-ink-tertiary">
                    No repositories available.{' '}
                    <a className="text-accent hover:underline" href={cloud.installUrl} target="_blank" rel="noreferrer">
                      Grant access
                    </a>
                    .
                  </li>
                )}
              </ul>
              <div className="flex gap-1 pt-1 border-t border-line">
                <input
                  className="flex-1 min-w-0 bg-panel border border-line rounded px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  aria-label="New repository name"
                />
                <button
                  className="bg-panel hover:bg-line rounded px-2 py-1 text-xs text-ink border border-line disabled:opacity-50"
                  onClick={handleCreate}
                  disabled={busy || newRepoName.trim() === ''}
                >
                  Create private
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
