#!/usr/bin/env node
// Zero-dependency static file server for the production build (dist/).
// SPA fallback: any path without a matching file serves index.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGithubAuthRoute } from './githubAuthRoutes.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT) || 3210;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function resolveFile(pathname) {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) return null;
  try {
    const stats = await stat(filePath);
    if (stats.isFile()) return filePath;
  } catch {
    return null;
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // Must run before the SPA fallback, which would otherwise answer /api/* with index.html.
  if (await handleGithubAuthRoute(req, res, url.pathname)) return;
  const filePath = (await resolveFile(url.pathname)) ?? join(root, 'index.html');
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, () => {
  console.log(`labeldesigner static server listening on :${port}`);
});
