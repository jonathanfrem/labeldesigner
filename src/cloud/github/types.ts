/**
 * Types for the optional GitHub cloud save (PLAN §2.7).
 *
 * Everything here describes a *link* to a remote file, never the file's contents — the
 * document model is untouched by this feature, and a project is identical whether it came
 * from disk, IndexedDB or a repo.
 */

/** Which repo, and which branch within it, the user has pointed the app at. */
export interface RepoRef {
  owner: string;
  repo: string;
  defaultBranch: string;
  private: boolean;
}

/**
 * A project's tie to one file in one repo.
 *
 * `sha` is the blob sha of the version we last wrote or read, and is what makes saving
 * safe: it goes back to GitHub on every write, and GitHub rejects the write if the file
 * has moved on since. Without it, opening the same project in two browsers would mean the
 * second save silently discards the first.
 */
export interface RemoteLink {
  owner: string;
  repo: string;
  branch: string;
  /** e.g. `projects/kaffeposer-a7f3c2.lbl.json` */
  path: string;
  sha: string;
  lastSyncedAt: number;
}

/** The signed-in GitHub user, for showing who the app is acting as. */
export interface GithubSession {
  login: string;
  avatarUrl: string;
}

/** Persisted token state. See tokenStore.ts for why this lives in IndexedDB. */
export interface GithubAuthState {
  accessToken: string;
  /** Epoch ms. GitHub issues 8-hour user tokens when the App opts into expiry. */
  expiresAt: number;
  refreshToken: string;
  /** Epoch ms, ~6 months out. Past this the user must reconnect from scratch. */
  refreshExpiresAt: number;
  login: string;
  avatarUrl: string;
}

/** What `/api/github/config` reports. `configured: false` hides the feature entirely. */
export interface GithubServerConfig {
  clientId: string;
  appSlug: string;
  configured: boolean;
}

/** One entry from a directory listing, narrowed to the files this app cares about. */
export interface RemoteFile {
  name: string;
  path: string;
  sha: string;
  size: number;
}
