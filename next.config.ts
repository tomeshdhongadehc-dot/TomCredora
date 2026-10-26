import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/csp";

const isDev = process.env.NODE_ENV !== "production";

const csp = buildCsp({ isDev, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });

const nextConfig: NextConfig = {
  // Tests build into their own folder (see playwright.config.ts) so they can run while `npm run dev` is up:
  // Next.js allows only one dev server per build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
