import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard reads the Paperclip API at request time, never at build time:
  // the control plane may be unreachable while this app is being built.
  output: "standalone",

  // The repo root holds its own package-lock.json for the pinned Paperclip
  // CLI, so Next would otherwise guess the wrong workspace root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
