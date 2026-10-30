import { defineConfig } from 'vitest/config';

/** Firestore rules tests — need the emulator (Java): npm run test:rules */
export default defineConfig({
  test: {
    include: ['test-rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
