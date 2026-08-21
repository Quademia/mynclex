import type { NextConfig } from "next";
import path from "node:path";
import fs from "node:fs";

// Only initialise Cloudflare dev bindings when running locally (npm run dev).
// In production, Cloudflare provides bindings automatically via the Worker runtime.
if (process.env.NODE_ENV === "development") {
  // `require` is deliberate here, and an `import` cannot replace it: imports
  // are hoisted and evaluated unconditionally, so the dev-only Cloudflare
  // shim would be pulled into production builds as well. The conditional
  // load is the whole point of this block.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}

// Pin Turbopack's workspace root to the nearest ancestor that owns a
// `node_modules`. Reason: session worktrees under `.claude/worktrees/`
// don't install their own packages — they share the parent repo's
// `node_modules` via Next.js's upward module resolution. If we just
// pinned `__dirname` (the worktree), Turbopack would refuse to look
// outside, and `next` itself would become unresolvable. Walking up
// finds the parent repo when in a worktree, and stays put when run
// directly from the parent repo.
function findProjectRoot(start: string): string {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, "node_modules"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

const nextConfig: NextConfig = {
  turbopack: {
    root: findProjectRoot(__dirname),
  },
  experimental: {
    // File uploads (media-asset foundation) pass the file bytes
    // through a Server Action, which caps the request body at 1 MB by
    // default. Raise it to clear our largest bucket cap (PDF activities
    // at 25 MB; library images at 5 MB) plus multipart overhead.
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
