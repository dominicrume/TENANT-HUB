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
    "@tenant-hub/adapters",
    "@tenant-hub/ports",
    "@tenant-hub/telemetry",
    "@tenant-hub/kya",
  ],
  // BUILD_PLAN C05: folded pages keep working links. Evaluated before middleware.
  async redirects() {
    return [
      { source: "/sessions",       destination: "/reports#sessions",  permanent: true },
      { source: "/handovers",      destination: "/tenants#handover",  permanent: true },
      { source: "/communications", destination: "/tenants",           permanent: true },
      { source: "/risk-flags",     destination: "/dashboard",         permanent: true },
      { source: "/ai-brain",       destination: "/tenants",           permanent: true },
      { source: "/audit-log",      destination: "/audit",             permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
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
