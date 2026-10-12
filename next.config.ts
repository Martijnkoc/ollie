import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM bundle from disk; keep both drivers out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
};

export default nextConfig;
