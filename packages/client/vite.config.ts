import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * BASE_PATH sets the public base path for static hosting, e.g. BASE_PATH=/spacecraft/ for
 * https://<user>.github.io/spacecraft/. Defaults to '/'.
 */
function basePath(): string {
  const raw = process.env.BASE_PATH?.trim();
  if (!raw || raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

export default defineConfig({
  base: basePath(),
  // .env files (.env.production with the public Firebase web config) live in the repo root.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: { host: '0.0.0.0', port: 5173 },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1024 },
  // peerjs ships CJS deps; let Vite pre-bundle them.
  optimizeDeps: { include: ['peerjs'] },
});
