# GitHub cloud save — setup and operations

How to register the GitHub App that backs the optional cloud save feature (PLAN §2.7), and
how to configure it for local development and for the VPS.

If none of this is done, the app still works — the GitHub UI hides itself entirely when the
server reports no client id. Nothing else degrades.

---

## Why a server is involved at all

`https://github.com/login/oauth/access_token` sends no CORS headers. This is true for the
web flow *and* the device flow, so there is no client-only workaround. `https://api.github.com`
*does* send them.

The consequence: the browser can do every file read and write itself, but the code → token
exchange (and each refresh) has to go through a server that holds the client secret. That
server is three routes in `scripts/githubAuthRoutes.mjs`, mounted by both `scripts/serve.mjs`
(production) and the Vite dev server. It holds no user data and has no database.

---

## 1. Register the GitHub App

A **GitHub App**, not an OAuth App. It can be restricted to individual repositories, whereas
an OAuth App's `repo` scope grants access to every repo the user can see.

Go to **Settings → Developer settings → GitHub Apps → New GitHub App**.

| Field | Value |
|---|---|
| GitHub App name | `Label Designer` (or `Label Designer (dev)` for the dev app) |
| Homepage URL | your deployment origin |
| Callback URL | `<origin>/auth/github/callback` |
| Request user authorization (OAuth) during installation | **on** |
| Enable Device Flow | off |
| Webhook → Active | **off** |
| Where can this be installed | *Any account*, or *Only this account* if it's just for you |

**Repository permissions** — exactly two, nothing else:

| Permission | Access |
|---|---|
| Contents | Read and write |
| Metadata | Read-only (mandatory, granted automatically) |

**Optional features → User-to-server token expiration: opt in.** This is what produces the
8-hour token plus a 6-month refresh token. The client is written to expect it.

After creating the App, note three things:

- **Client ID** (`Iv23li...`) — public, served to the browser.
- **Client secret** — generate one. Server-side only; it never enters the bundle.
- **App slug** — the last path segment of the App's public page, e.g. `label-designer`.
  Used to build the install URL.

Register a **second, separate App** for local development with callback
`http://localhost:5173/auth/github/callback`. Don't reuse the production App: a GitHub App
has one callback URL, and pointing production at localhost breaks it for everyone.

---

## 2. Local development

```bash
export GITHUB_CLIENT_ID=Iv23liXXXXXXXXXXXXXX
export GITHUB_CLIENT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
export GITHUB_APP_SLUG=label-designer-dev
npm run dev
```

The Vite dev server mounts the same three routes as production, so the flow is exercised
end-to-end locally. Never commit these values — there is no `.env` file in this repo by
design, and `.gitignore` should stay that way.

Confirm the wiring before debugging anything else:

```bash
curl -s -H 'Origin: http://localhost:5173' http://localhost:5173/api/github/config
```

Expect `{"clientId":"Iv23li...","appSlug":"...","configured":true}`. If `configured` is
false, the environment variables aren't reaching the process.

---

## 3. Production (VPS)

The secrets live on the box, in the systemd unit — **not** in GitHub Actions. The deploy
workflow doesn't need them and shouldn't have them.

Put them in a root-only environment file:

```bash
sudo install -m 600 /dev/null /etc/labeldesigner.env
sudo tee /etc/labeldesigner.env >/dev/null <<'EOF'
GITHUB_CLIENT_ID=Iv23liXXXXXXXXXXXXXX
GITHUB_CLIENT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
GITHUB_APP_SLUG=label-designer
EOF
```

Reference it from `labeldesigner.service`:

```ini
[Service]
EnvironmentFile=/etc/labeldesigner.env
```

Then `sudo systemctl daemon-reload && sudo systemctl restart labeldesigner.service`.

If a reverse proxy sits in front of `serve.mjs`, it must forward `/api/github/*` to the
same origin as the SPA and pass the `Origin` header through. The origin check in
`githubAuthRoutes.mjs` depends on it.

### Rotating the client secret

Generate a new secret in the App settings, update `/etc/labeldesigner.env`, restart the
service, then delete the old secret on GitHub. Already-issued user tokens keep working —
the secret is only used to mint and refresh them, so nobody gets logged out.

---

## 4. What the user does

1. **Connect GitHub** in the project library. A popup opens GitHub's authorize page.
2. On first use, GitHub asks where to **install** the App. Picking "Only select
   repositories" and choosing one private repo is the recommended answer — it is the real
   boundary on what this app can ever touch.
3. Pick or create a repo in the app. "Create private repo" does it without leaving the page.
4. Ctrl+S now commits to `projects/`.

Authorizing and installing are two different things, and a user can complete the first
without the second. The client detects an empty `GET /user/installations` and sends them to
`https://github.com/apps/<slug>/installations/new`.

### Revoking access

**Settings → Applications → Authorized GitHub Apps → Revoke**, or uninstall the App from
**Settings → Applications → Installed GitHub Apps**. "Disconnect" in the label designer only
clears the local token copy; it cannot revoke server-side.

---

## 5. Troubleshooting

| Symptom | Cause |
|---|---|
| No GitHub UI at all | `/api/github/config` returned `configured: false` or was unreachable. Check the env vars reached the process. |
| `redirect_uri_mismatch` | The App's callback URL doesn't exactly match `<origin>/auth/github/callback`. Scheme and port count. |
| Popup closes, nothing happens | The `state` didn't match, or `postMessage` was rejected. Both are origin checks — usually means the popup landed on a different origin than the opener (e.g. `www.` vs bare domain). |
| 404 saving to a repo that exists | The App isn't installed on that repo. GitHub returns 404 rather than 403 for private repos a token can't see. |
| "Reconnect GitHub" after ~6 months | The refresh token expired. Expected; reconnecting is the fix. |
| Every save conflicts | Something else is committing to the same paths. Check for a second browser profile still linked to the repo. |
