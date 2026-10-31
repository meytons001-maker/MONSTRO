import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
