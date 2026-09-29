import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The libSQL client ships a native module for local files; load it from node_modules instead of bundling it.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
