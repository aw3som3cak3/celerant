/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; keep it out of the bundle so it loads
  // from node_modules at runtime.
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
