import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve the same `@/*` → repo-root alias the app uses (tsconfig paths), so
// tests can import modules by their canonical `@/lib/...` path instead of
// brittle relative hops.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
