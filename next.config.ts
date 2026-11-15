import type { NextConfig } from "next";

// Production builds run on webpack (see package.json); this lets postcss.config.mjs know.
if (process.argv.includes("--webpack")) process.env.YOYO_WEBPACK_BUILD = "1";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Never ship source maps to browsers in production.
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["@node-rs/argon2"],
  experimental: {
    // Shared hosting caps threads/processes per account. Without this Next spawns one
    // build worker per visible CPU and the build dies with "OS can't spawn worker thread".
    cpus: 2,
    serverActions: { bodySizeLimit: "8mb" },
  },
  async headers() {
    // No Access-Control-Allow-Origin is ever set: the API is same-origin only.
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
