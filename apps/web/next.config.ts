import type { NextConfig } from "next";

// The one backend address. The browser only ever calls this site's own /api/v1/...;
// the site forwards those calls to the backend (apps/api). Set API_ORIGIN at build time.
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The Detection page was removed (DOB-121): its investigations are a filter of Investigations.
  async redirects() {
    return [{ source: "/detection", destination: "/investigations?pillar=detection", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
};

export default nextConfig;
