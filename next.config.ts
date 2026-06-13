import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Python data fetching lives in /api/*.py (Vercel Python runtime), not Next.
  // Nothing special needed here — the seam is the data-source interface in lib/.
};

export default nextConfig;
