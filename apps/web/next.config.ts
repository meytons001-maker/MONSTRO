import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.MONSTRO_STANDALONE === "false" ? undefined : "standalone",
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  ] }]; },
  serverExternalPackages: [
    "@monstro/lead-intelligence",
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "@duckdb/node-bindings-win32-x64",
    "@duckdb/node-bindings-win32-arm64",
    "@duckdb/node-bindings-linux-x64",
    "@duckdb/node-bindings-linux-x64-musl",
    "@duckdb/node-bindings-linux-arm64",
    "@duckdb/node-bindings-linux-arm64-musl",
  ],
};

export default nextConfig;
