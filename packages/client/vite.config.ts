import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '0.0.0.0', port: 5173 },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1024 },
  // peerjs ships CJS deps; let Vite pre-bundle them.
  optimizeDeps: { include: ['peerjs'] },
});
