/**
 * GitHub App user authorization (PLAN §2.7).
 *
 * The browser opens GitHub's authorize page and receives a `code`; our server turns that
 * into a token because github.com's token endpoint sends no CORS headers. That is the only
 * reason a server exists in this project — everything afterwards goes browser-to-GitHub.
 *
 * The token is kept in IndexedDB, readable by JS, because the browser sets its own
 * `Authorization` header when calling api.github.com. An httpOnly cookie would mean routing
 * every file operation through our server, which is a genuine backend holding user data —
 * far beyond the exception CLAUDE.md invariant 1 allows. The blast radius is bounded
 * instead by the App's permissions (Contents + Metadata, only on repos the user picked) and
 * by the 8-hour token lifetime.
 */
import { deleteSetting, readSetting, writeSetting } from '../../storage/settingsStore';
import { AuthError, NetworkError } from './errors';
import type { GithubAuthState, GithubServerConfig, GithubSession } from './types';

const AUTH_KEY = 'github.auth';
const STATE_KEY = 'github.oauth.state';

/** Refresh this far before expiry so a save never races the deadline. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

const POPUP_FEATURES = 'width=720,height=820,menubar=no,toolbar=no';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function fetchServerConfig(): Promise<GithubServerConfig> {
  try {
    const response = await fetch('/api/github/config');
    if (!response.ok) return { clientId: '', appSlug: '', configured: false };
    return (await response.json()) as GithubServerConfig;
  } catch {
    // A static-only deployment has no such route. Treat that as "feature off", not an error:
    // the app must stay fully usable without it.
    return { clientId: '', appSlug: '', configured: false };
  }
}

export class GithubAuth {
  private state: GithubAuthState | null = null;
  private loaded = false;

  /**
   * Notified whenever the stored session changes.
   *
   * A session can end without the user doing anything — a revoked token or an expired
   * refresh token clears it from deep inside a save. Without this, the UI would keep
   * showing the old login and hide the Connect button, leaving no way back.
   */
  private listeners = new Set<(session: GithubSession | null) => void>();

  subscribe(listener: (session: GithubSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * The in-flight refresh, shared by every concurrent caller.
   *
   * GitHub invalidates a refresh token the instant it is used and issues a new one. Two
   * refreshes racing would each spend the same token; the loser's response is already dead
   * on arrival, and the user is silently logged out mid-save. Single-flighting is the whole
   * defence, so never bypass this.
   */
  private refreshInFlight: Promise<string> | null = null;

  private async load(): Promise<GithubAuthState | null> {
    if (!this.loaded) {
      this.state = await readSetting<GithubAuthState>(AUTH_KEY);
      this.loaded = true;
    }
    return this.state;
  }

  private async store(state: GithubAuthState | null): Promise<void> {
    this.state = state;
    this.loaded = true;
    if (state) await writeSetting(AUTH_KEY, state);
    else await deleteSetting(AUTH_KEY);
    const session = state ? { login: state.login, avatarUrl: state.avatarUrl } : null;
    this.listeners.forEach((listener) => listener(session));
  }

  async getSession(): Promise<GithubSession | null> {
    const state = await this.load();
    if (!state) return null;
    return { login: state.login, avatarUrl: state.avatarUrl };
  }

  async isConnected(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  /**
   * Opens the authorize popup and resolves once the token is stored.
   *
   * Must be called directly from a click — a popup opened later in an async tick is blocked.
   */
  async connect(config: GithubServerConfig): Promise<GithubSession> {
    const oauthState = crypto.randomUUID();
    // sessionStorage, not a field: the popup's message arrives at the opener, and tying the
    // value to the tab means a stale value can't survive a reload mid-flow.
    sessionStorage.setItem(STATE_KEY, oauthState);

    const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
    authorizeUrl.searchParams.set('client_id', config.clientId);
    authorizeUrl.searchParams.set('redirect_uri', `${window.location.origin}/auth/github/callback`);
    authorizeUrl.searchParams.set('state', oauthState);

    const popup = window.open(authorizeUrl.toString(), 'github-oauth', POPUP_FEATURES);
    if (!popup) throw new AuthError('Your browser blocked the GitHub sign-in window. Allow popups for this site and try again.');

    const code = await waitForCallback(popup, oauthState);
    const token = await exchangeCode(code);
    return this.adoptToken(token);
  }

  /** Turns a token response into stored state, resolving the user it belongs to. */
  private async adoptToken(token: TokenResponse): Promise<GithubSession> {
    const accessToken = requireToken(token);
    const now = Date.now();
    const user = await fetchUser(accessToken);
    const state: GithubAuthState = {
      accessToken,
      expiresAt: now + (token.expires_in ?? 8 * 3600) * 1000,
      refreshToken: token.refresh_token ?? '',
      refreshExpiresAt: now + (token.refresh_token_expires_in ?? 6 * 30 * 24 * 3600) * 1000,
      login: user.login,
      avatarUrl: user.avatar_url,
    };
    await this.store(state);
    return { login: state.login, avatarUrl: state.avatarUrl };
  }

  /**
   * A valid access token, refreshed if it is expired or about to be.
   *
   * `force` is used by the REST client after an unexpected 401 — a token revoked from
   * GitHub's UI looks valid to us until a call fails.
   */
  getValidToken = async (options?: { force?: boolean }): Promise<string> => {
    const state = await this.load();
    if (!state) throw new AuthError('Not connected to GitHub.');

    const stale = options?.force === true || Date.now() > state.expiresAt - REFRESH_SKEW_MS;
    if (!stale) return state.accessToken;

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refresh(state).finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  };

  private async refresh(state: GithubAuthState): Promise<string> {
    if (!state.refreshToken || Date.now() > state.refreshExpiresAt) {
      await this.store(null);
      throw new AuthError('Your GitHub connection has expired. Reconnect to keep saving.');
    }

    let token: TokenResponse;
    try {
      token = await postJson('/api/github/refresh', { refresh_token: state.refreshToken });
    } catch (err) {
      // A transport failure is not a dead session — the user may simply be offline, and
      // clearing their connection over a flaky network would be its own bug.
      if (err instanceof NetworkError) throw err;
      await this.store(null);
      throw new AuthError('Could not refresh your GitHub session. Reconnect to keep saving.');
    }

    if (token.error || !token.access_token) {
      await this.store(null);
      throw new AuthError('Your GitHub connection has expired. Reconnect to keep saving.');
    }

    const now = Date.now();
    await this.store({
      ...state,
      accessToken: token.access_token,
      expiresAt: now + (token.expires_in ?? 8 * 3600) * 1000,
      // GitHub rotates the refresh token on every use; keeping the old one would strand us.
      refreshToken: token.refresh_token ?? state.refreshToken,
      refreshExpiresAt: now + (token.refresh_token_expires_in ?? 6 * 30 * 24 * 3600) * 1000,
    });
    return token.access_token;
  }

  /** Clears the local copy only — this cannot revoke server-side. See docs/GITHUB-SETUP.md. */
  async disconnect(): Promise<void> {
    await this.store(null);
  }
}

/**
 * Waits for the popup to report back.
 *
 * Both checks matter: `event.origin` proves the message came from our own page rather than
 * github.com or anything else the popup visited, and comparing `state` proves this response
 * belongs to the flow we started rather than one an attacker induced. The state value is
 * consumed either way so it can't be replayed.
 */
function waitForCallback(popup: Window, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const settle = (fn: () => void) => {
      window.removeEventListener('message', onMessage);
      clearInterval(closedTimer);
      sessionStorage.removeItem(STATE_KEY);
      fn();
    };

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; code?: string; state?: string; error?: string } | null;
      if (!data || data.type !== 'github-oauth') return;

      if (data.state !== expectedState) {
        settle(() => reject(new AuthError('GitHub sign-in could not be verified. Please try again.')));
        return;
      }
      if (data.error || !data.code) {
        settle(() => reject(new AuthError(data.error ? `GitHub sign-in failed: ${data.error}` : 'GitHub sign-in was cancelled.')));
        return;
      }
      settle(() => resolve(data.code as string));
    }

    // The popup can be closed by hand, which produces no message at all.
    const closedTimer = setInterval(() => {
      if (popup.closed) settle(() => reject(new AuthError('GitHub sign-in was cancelled.')));
    }, 500);

    window.addEventListener('message', onMessage);
  });
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  return postJson('/api/github/token', { code });
}

async function postJson(url: string, body: unknown): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new NetworkError('Could not reach the sign-in service. Check your connection.');
  }
  return (await response.json()) as TokenResponse;
}

function requireToken(token: TokenResponse): string {
  if (!token.access_token) {
    throw new AuthError(token.error_description || token.error || 'GitHub did not return an access token.');
  }
  return token.access_token;
}

async function fetchUser(accessToken: string): Promise<{ login: string; avatar_url: string }> {
  const response = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new AuthError('Connected to GitHub, but could not read your account details.');
  return (await response.json()) as { login: string; avatar_url: string };
}

/**
 * Runs in the popup before React mounts. Reports the result to the opener and closes.
 *
 * Returns true if this document is the OAuth callback, in which case the app must not boot:
 * mounting the full editor in a window that is about to close wastes work and can flash UI.
 */
export function handleOAuthCallbackWindow(): boolean {
  if (window.location.pathname !== '/auth/github/callback') return false;

  const params = new URLSearchParams(window.location.search);
  const message = {
    type: 'github-oauth',
    code: params.get('code') ?? undefined,
    state: params.get('state') ?? undefined,
    error: params.get('error_description') ?? params.get('error') ?? undefined,
  };

  // Explicit targetOrigin: a wildcard would hand the code to whatever the popup happens to
  // be showing if the redirect ever landed somewhere unexpected.
  window.opener?.postMessage(message, window.location.origin);
  window.close();

  // If the window can't close itself (opened directly rather than as a popup), say so
  // instead of leaving a blank page.
  document.body.textContent = 'You can close this window and return to Label Designer.';
  return true;
}
