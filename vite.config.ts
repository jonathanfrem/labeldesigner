/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error -- plain .mjs shared with scripts/serve.mjs, deliberately untyped so the
// production server stays dependency-free and needs no build step.
import { githubAuthDevMiddleware } from './scripts/githubAuthRoutes.mjs';

export default defineConfig({
  // The dev server mounts the same OAuth routes as scripts/serve.mjs, so the GitHub flow is
  // exercised end-to-end in `npm run dev` rather than only after a deploy (PLAN §2.7).
  plugins: [react(), githubAuthDevMiddleware()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
