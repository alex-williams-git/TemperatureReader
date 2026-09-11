import path from "node:path";
import type { NextConfig } from "next";

// Where the browser-facing /api proxy forwards to. The rewrite destination is
// resolved when `next build` runs, so this must be set at build time: the
// Dockerfile's builder stage sets BACKEND_ORIGIN=http://backend:8000. For
// native `next dev` / `next build` it falls back to localhost.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Emit a self-contained server (.next/standalone) so the runtime image
  // doesn't need node_modules or the Next CLI.
  output: "standalone",

  // Turbopack otherwise refuses to resolve modules outside this directory.
  // AmbientBackground.tsx imports ../../../thermal-profile.json (repo root),
  // the shared source of truth also read by rgb-bridge.
  turbopack: {
    root: path.join(__dirname, ".."),
  },

  // Same-origin API: the browser calls /api/*, the Next server proxies it to
  // the backend. No CORS, and no backend URL compiled into the client bundle.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
