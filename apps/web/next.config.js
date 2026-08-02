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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'data',
        hostname: '**',
      }
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'zod/v3': require.resolve('zod'),
    };
    return config;
  },
};
module.exports = nextConfig;
