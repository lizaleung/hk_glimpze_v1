import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All data fetching is in-process TypeScript now (see the HsiDataSource seam in
  // app/analyses/hsi-valuation/yahoo-source.ts). yahoo-finance2 is a server-only
  // dependency; ensure it's bundled for the Node server runtime, never the client.
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
