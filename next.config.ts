import type { NextConfig } from "next";
import path from "node:path";
import fs from "node:fs";

// Only initialise Cloudflare dev bindings when running locally (npm run dev).
// In production, Cloudflare provides bindings automatically via the Worker runtime.
if (process.env.NODE_ENV === "development") {
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
};

export default nextConfig;
