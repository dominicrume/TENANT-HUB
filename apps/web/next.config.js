/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@tenant-hub/ui",
    "@tenant-hub/domain",
    "@tenant-hub/validation",
    "@tenant-hub/auth",
    "@tenant-hub/audit",
    "@tenant-hub/intake-core",
    "@tenant-hub/ai",
    "@tenant-hub/db",
    "@tenant-hub/blockchain",
    "@tenant-hub/env",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
};
module.exports = nextConfig;
