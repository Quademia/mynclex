import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Resolve the same `@/*` → repo-root alias the app uses (tsconfig paths), so
// tests can import modules by their canonical `@/lib/...` path instead of
// brittle relative hops.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `import 'server-only'` is the repo's server-module marker, but the
      // package is not in node_modules — Next.js resolves it through its own
      // build alias. Without this stub, any module carrying the marker is
      // untestable. See test/stubs/server-only.ts.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
});
