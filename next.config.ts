import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The libSQL client ships a native module for local files; load it from node_modules instead of bundling it.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Bake the deployed commit into the build so /api/version can report it (Netlify sets COMMIT_REF while building).
  env: { GIT_COMMIT_SHA: process.env.COMMIT_REF || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "" },
};

export default nextConfig;
