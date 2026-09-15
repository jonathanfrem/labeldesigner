// OAuth token exchange for GitHub cloud save (PLAN §2.7).
//
// This exists for exactly one reason: https://github.com/login/oauth/access_token sends no
// CORS headers, for the web flow and the device flow alike, so a browser cannot complete the
// exchange itself. Every *file* operation goes straight from the browser to api.github.com,
// which does send them — nothing but the token handshake passes through here.
//
// Deliberately holds no state, touches no database, and never sees a label document. Shared
// verbatim by scripts/serve.mjs (production) and the Vite dev server, so the flow that runs
// in `npm run dev` is the one that runs in production.
import { Buffer } from 'node:buffer';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** Requests are a code or a refresh token and nothing else; anything larger is not ours. */
const MAX_BODY_BYTES = 4096;

const clientId = () => process.env.GITHUB_CLIENT_ID ?? '';
const clientSecret = () => process.env.GITHUB_CLIENT_SECRET ?? '';
/** Last path segment of the App's public page — used to build the install URL. */
const appSlug = () => process.env.GITHUB_APP_SLUG ?? '';

const isConfigured = () => clientId() !== '' && clientSecret() !== '';

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // Tokens must never land in a shared cache or a browser's back/forward cache.
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/**
 * Same-origin check without hardcoding a hostname: compare the Origin header's host against
 * the Host header the request arrived with. A reverse proxy must pass both through.
 *
 * This endpoint is publicly reachable, and without the check anyone could point their own
 * site's OAuth flow at it and have us mint tokens for them using our client secret. Browsers
 * always send Origin on POST, including same-origin POSTs, so a missing header means the
 * caller isn't a browser doing what we support.
 */
function isSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

class BodyError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        done = true;
        // Stop buffering but keep draining. Destroying the socket here would abort the
        // response too, so the client would see a connection error instead of the 413.
        req.resume();
        reject(new BodyError(413, 'payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new BodyError(400, 'bad_request'));
      }
    });
    req.on('error', (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

/**
 * Posts to GitHub with the client secret attached and hands the response back untouched.
 * GitHub reports OAuth failures as HTTP 200 with an `error` field, so the caller checks the
 * body rather than the status — and `error_description` is the only useful diagnostic for a
 * misconfigured App, which is why it's passed through verbatim.
 */
async function exchange(params) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      // Without this GitHub replies form-encoded.
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...params, client_id: clientId(), client_secret: clientSecret() }),
  });
  return response.json();
}

/**
 * Returns true if the request was handled. `serve.mjs` and the Vite middleware both call
 * this before their own routing.
 *
 * Nothing here logs a request body, a code, or a token — the whole point of the endpoint is
 * that those values exist only in flight.
 */
export async function handleGithubAuthRoute(req, res, pathname) {
  if (!pathname.startsWith('/api/github/')) return false;

  if (pathname === '/api/github/config' && req.method === 'GET') {
    // Public values only: the client id and slug appear in the authorize URL anyway. The SPA
    // reads them at runtime so `npm run build` stays environment-free and one bundle deploys
    // anywhere; `configured: false` makes the UI hide the feature rather than half-offer it.
    sendJson(res, 200, { clientId: clientId(), appSlug: appSlug(), configured: isConfigured() });
    return true;
  }

  const isToken = pathname === '/api/github/token';
  const isRefresh = pathname === '/api/github/refresh';
  if (!isToken && !isRefresh) {
    sendJson(res, 404, { error: 'not_found' });
    return true;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return true;
  }
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: 'forbidden_origin' });
    return true;
  }
  if (!isConfigured()) {
    sendJson(res, 503, {
      error: 'not_configured',
      error_description: 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set on the server.',
    });
    return true;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    sendJson(res, 415, { error: 'unsupported_media_type' });
    return true;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    // Close rather than keep-alive: on an oversized body the client may still be sending,
    // and reusing the connection would leave its remainder framed as the next request.
    res.setHeader('Connection', 'close');
    sendJson(res, err?.status ?? 400, { error: err?.code ?? 'bad_request' });
    return true;
  }

  const params = isToken
    ? { grant_type: 'authorization_code', code: body?.code }
    : { grant_type: 'refresh_token', refresh_token: body?.refresh_token };
  const required = isToken ? params.code : params.refresh_token;
  if (typeof required !== 'string' || required === '') {
    sendJson(res, 400, { error: 'bad_request', error_description: `Missing "${isToken ? 'code' : 'refresh_token'}".` });
    return true;
  }

  try {
    sendJson(res, 200, await exchange(params));
  } catch {
    // Upstream is unreachable. No detail to leak and none worth logging.
    sendJson(res, 502, { error: 'upstream_unreachable' });
  }
  return true;
}

/** Vite dev-server middleware wrapper, so `npm run dev` exercises the real flow. */
export function githubAuthDevMiddleware() {
  return {
    name: 'github-auth-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        handleGithubAuthRoute(req, res, pathname).then(
          (handled) => {
            if (!handled) next();
          },
          (err) => next(err),
        );
      });
    },
  };
}
