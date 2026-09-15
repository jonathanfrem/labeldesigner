/**
 * Thin client over api.github.com (PLAN §2.7).
 *
 * Every call here runs straight from the browser — api.github.com sends CORS headers, so
 * no file operation touches our own server. Only the token handshake does, and that lives
 * in auth.ts.
 *
 * The client is deliberately dumb about *what* it moves: it deals in strings and shas, and
 * knows nothing about label documents. Serialisation stays in lib/projectJson.ts.
 */
import { decodeBase64, encodeBase64 } from './base64';
import { ApiError, AuthError, ConflictError, NetworkError, NotFoundError, RateLimitError } from './errors';
import type { RemoteFile, RepoRef } from './types';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** Supplies a valid token, refreshing if needed. Injected so restClient stays testable and auth-agnostic. */
export type TokenProvider = (options?: { force?: boolean }) => Promise<string>;

interface RequestOptions {
  method?: string;
  body?: unknown;
  accept?: string;
  /** Set by the retry path so a refreshed token is never itself retried into a loop. */
  isRetry?: boolean;
}

export class GithubRestClient {
  constructor(private readonly getToken: TokenProvider) {}

  private async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const { method = 'GET', body, accept = 'application/vnd.github+json', isRetry = false } = options;
    const token = await this.getToken({ force: isRetry });

    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${path}`, {
        method,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': API_VERSION,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // fetch only rejects for transport failures; every HTTP status resolves.
      throw new NetworkError('Could not reach GitHub. Check your connection.');
    }

    if (response.ok) return response;

    // A token can be revoked from GitHub's UI at any time, and our cached expiry won't know.
    // Force one refresh and retry; if that also 401s, the session is genuinely gone.
    if (response.status === 401 && !isRetry) {
      return this.request(path, { ...options, isRetry: true });
    }

    throw await toError(response, method);
  }

  private async requestJson<T>(path: string, options?: RequestOptions): Promise<T> {
    return (await this.request(path, options)).json() as Promise<T>;
  }

  async getUser(): Promise<{ login: string; avatar_url: string }> {
    return this.requestJson('/user');
  }

  /** Repos the App is actually installed on — not every repo the user owns. See listAccessibleRepos. */
  async listInstallations(): Promise<{ installations: { id: number; account: { login: string } }[] }> {
    return this.requestJson('/user/installations');
  }

  /**
   * The repo picker's source. Listing installation repos rather than `/user/repos` means the
   * picker only ever offers repos the token can actually write — otherwise the user picks a
   * repo, saves, and gets an unexplained 404.
   */
  async listInstallationRepos(installationId: number): Promise<RepoRef[]> {
    const data = await this.requestJson<{ repositories: GithubRepo[] }>(
      `/user/installations/${installationId}/repositories?per_page=100`,
    );
    return data.repositories.map(toRepoRef);
  }

  async createRepo(name: string): Promise<RepoRef> {
    const repo = await this.requestJson<GithubRepo>('/user/repos', {
      method: 'POST',
      body: {
        name,
        private: true,
        // Without a commit the repo has no default branch, and every contents write would
        // 404 until the user made one by hand.
        auto_init: true,
        description: 'Label Designer projects',
      },
    });
    return toRepoRef(repo);
  }

  /** Returns null when the directory doesn't exist yet — an empty repo is normal, not an error. */
  async listDir(repo: RepoRef, dir: string): Promise<RemoteFile[] | null> {
    try {
      const entries = await this.requestJson<GithubContentEntry[]>(
        `${contentsPath(repo, dir)}?ref=${encodeURIComponent(repo.defaultBranch)}`,
      );
      return entries.filter((e) => e.type === 'file').map((e) => ({ name: e.name, path: e.path, sha: e.sha, size: e.size }));
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  /**
   * Reads a file. Returns null if it isn't there.
   *
   * Files over 1MB can't be returned in the JSON envelope, so those need a second call with
   * the raw media type — but raw responses carry no sha, and the sha is what makes saving
   * safe. So the metadata call comes first regardless, and only the *content* falls back.
   * A project with an embedded image crosses 1MB easily, so this path is not hypothetical.
   */
  async getFile(repo: RepoRef, path: string): Promise<{ text: string; sha: string } | null> {
    const ref = `?ref=${encodeURIComponent(repo.defaultBranch)}`;
    let meta: GithubContentFile;
    try {
      meta = await this.requestJson<GithubContentFile>(`${contentsPath(repo, path)}${ref}`);
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }

    if (meta.content !== undefined && meta.content !== '') {
      return { text: decodeBase64(meta.content), sha: meta.sha };
    }
    const raw = await this.request(`${contentsPath(repo, path)}${ref}`, { accept: 'application/vnd.github.raw' });
    return { text: await raw.text(), sha: meta.sha };
  }

  /**
   * Creates or overwrites a file in one commit.
   *
   * `sha` is the optimistic-concurrency token: pass the sha last read to update, omit it to
   * create. GitHub refuses the write if the file has changed since, which surfaces as
   * ConflictError rather than a silent overwrite of someone else's save.
   */
  async putFile(
    repo: RepoRef,
    path: string,
    text: string,
    message: string,
    sha: string | undefined,
  ): Promise<{ sha: string }> {
    const result = await this.requestJson<{ content: { sha: string } }>(contentsPath(repo, path), {
      method: 'PUT',
      body: {
        message,
        content: encodeBase64(text),
        branch: repo.defaultBranch,
        ...(sha === undefined ? {} : { sha }),
      },
    });
    return { sha: result.content.sha };
  }

  async deleteFile(repo: RepoRef, path: string, message: string, sha: string): Promise<void> {
    await this.request(contentsPath(repo, path), {
      method: 'DELETE',
      body: { message, sha, branch: repo.defaultBranch },
    });
  }
}

interface GithubRepo {
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
}

interface GithubContentEntry {
  type: string;
  name: string;
  path: string;
  sha: string;
  size: number;
}

interface GithubContentFile extends GithubContentEntry {
  content?: string;
}

function toRepoRef(repo: GithubRepo): RepoRef {
  return { owner: repo.owner.login, repo: repo.name, defaultBranch: repo.default_branch, private: repo.private };
}

function contentsPath(repo: RepoRef, path: string): string {
  // Slashes separate path segments and must stay literal; everything else is escaped.
  const escaped = path.split('/').map(encodeURIComponent).join('/');
  return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${escaped}`;
}

async function toError(response: Response, method: string) {
  const message = await readMessage(response);

  switch (response.status) {
    case 401:
      return new AuthError('Your GitHub session has expired. Reconnect to continue saving.');

    case 403: {
      if (response.headers.get('x-ratelimit-remaining') === '0') {
        const reset = Number(response.headers.get('x-ratelimit-reset') ?? 0) * 1000;
        return new RateLimitError('GitHub rate limit reached. Try again shortly.', reset);
      }
      return new ApiError(message || 'GitHub refused that request.', 403);
    }

    case 404:
      // GitHub deliberately returns 404 rather than 403 for private repos a token can't
      // see, so "missing" and "no longer authorised" are indistinguishable here.
      return new NotFoundError('Not found on GitHub — it may have been deleted, or the app may no longer have access to that repository.');

    case 409:
      return new ConflictError('This file changed on GitHub since you opened it.');

    case 422:
      // 422 covers real validation errors too, so only treat writes as conflicts.
      if (method === 'PUT' || method === 'DELETE') {
        return new ConflictError(message || 'This file changed on GitHub since you opened it.');
      }
      return new ApiError(message || 'GitHub rejected that request.', 422);

    default:
      return new ApiError(message || `GitHub returned ${response.status}.`, response.status);
  }
}

async function readMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return typeof body.message === 'string' ? body.message : '';
  } catch {
    return '';
  }
}
