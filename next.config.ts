import type { NextConfig } from "next";

// Only initialise Cloudflare dev bindings when running locally (npm run dev).
// In production, Cloudflare provides bindings automatically via the Worker runtime.
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
