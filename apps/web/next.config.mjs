/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright is a server-only runtime dependency. Keeping it external prevents
  // Next/Webpack from traversing Playwright's optional protocol adapters while
  // still allowing the mission runtime to load it when Chromium is explicitly
  // configured on the server.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
