// OpenNext config — tells the adapter how to build our app for Cloudflare.
// Default settings work for a stock Next.js app; we'll add options here
// later if we need custom incremental cache, queueing, etc.

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
