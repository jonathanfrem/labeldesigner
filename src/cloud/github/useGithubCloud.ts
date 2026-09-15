/**
 * React surface for GitHub cloud save (PLAN §2.7).
 *
 * Owns the connection and the chosen repo; the per-project link lives on the project
 * itself (`StoredProject.remote`) and is handled by projectSession.ts. One instance is
 * created at the app root and shared through context, so the auth object — and therefore
 * its single-flight refresh — is never duplicated.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { readSetting, writeSetting, deleteSetting } from '../../storage/settingsStore';
import { fetchServerConfig, GithubAuth } from './auth';
import { GithubRestClient } from './restClient';
import type { GithubServerConfig, GithubSession, RepoRef } from './types';

const REPO_KEY = 'github.repo';

export interface GithubCloudApi {
  /** False when the server reports no client id — the UI hides the feature entirely. */
  available: boolean;
  loading: boolean;
  session: GithubSession | null;
  repo: RepoRef | null;
  /** Connected, but the App isn't installed on any repo yet. */
  needsInstall: boolean;
  installUrl: string;
  client: GithubRestClient | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  listRepos: () => Promise<RepoRef[]>;
  createRepo: (name: string) => Promise<RepoRef>;
  selectRepo: (repo: RepoRef) => Promise<void>;
  refreshInstallState: () => Promise<void>;
}

export function useGithubCloud(): GithubCloudApi {
  // One auth instance for the app's lifetime — see the single-flight note in auth.ts.
  const auth = useMemo(() => new GithubAuth(), []);
  const client = useMemo(() => new GithubRestClient(auth.getValidToken), [auth]);

  const [config, setConfig] = useState<GithubServerConfig | null>(null);
  const [session, setSession] = useState<GithubSession | null>(null);
  const [repo, setRepo] = useState<RepoRef | null>(null);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [loading, setLoading] = useState(true);

  // A revoked or expired session is discovered mid-save, deep inside auth. Without this the
  // panel would keep showing the old login with the Connect button hidden, and the user
  // would have no way back.
  useEffect(() => auth.subscribe(setSession), [auth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [serverConfig, restored, storedRepo] = await Promise.all([
        fetchServerConfig(),
        auth.getSession(),
        readSetting<RepoRef>(REPO_KEY),
      ]);
      if (cancelled) return;
      setConfig(serverConfig);
      setSession(restored);
      setRepo(storedRepo);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  /**
   * Authorising the App and installing it are separate steps, and a user can finish the
   * first without the second — they'd then see an empty repo picker with no explanation.
   * An empty installations list is the signal to send them to the install page.
   */
  const refreshInstallState = useCallback(async () => {
    if (!(await auth.isConnected())) return;
    const { installations } = await client.listInstallations();
    setNeedsInstall(installations.length === 0);
  }, [auth, client]);

  const connect = useCallback(async () => {
    if (!config?.configured) return;
    // Must run synchronously enough to keep the click's popup permission.
    const next = await auth.connect(config);
    setSession(next);
    await refreshInstallState();
  }, [auth, config, refreshInstallState]);

  const disconnect = useCallback(async () => {
    await auth.disconnect();
    await deleteSetting(REPO_KEY);
    setSession(null);
    setRepo(null);
    setNeedsInstall(false);
  }, [auth]);

  /** Repos across every installation — what the token can actually write, nothing more. */
  const listRepos = useCallback(async () => {
    const { installations } = await client.listInstallations();
    const lists = await Promise.all(installations.map((i) => client.listInstallationRepos(i.id)));
    return lists.flat().sort((a, b) => `${a.owner}/${a.repo}`.localeCompare(`${b.owner}/${b.repo}`));
  }, [client]);

  const createRepo = useCallback((name: string) => client.createRepo(name), [client]);

  const selectRepo = useCallback(async (next: RepoRef) => {
    await writeSetting(REPO_KEY, next);
    setRepo(next);
  }, []);

  return {
    available: config?.configured === true,
    loading,
    session,
    repo,
    needsInstall,
    installUrl: config?.appSlug ? `https://github.com/apps/${config.appSlug}/installations/new` : 'https://github.com/settings/installations',
    client: session ? client : null,
    connect,
    disconnect,
    listRepos,
    createRepo,
    selectRepo,
    refreshInstallState,
  };
}
