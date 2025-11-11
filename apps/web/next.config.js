/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@canvas-memory/types', '@canvas-memory/ui'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  webpack: (config, { isServer }) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];

    // Fix case-sensitivity warnings on Windows
    // See: https://github.com/vercel/next.js/issues/36953
    config.snapshot = {
      ...config.snapshot,
      managedPaths: [/^(.+?[\\/]node_modules[\\/])/i],
    };

    // CRITICAL FIX: Add webpack alias for env.config module
    // Fixes E2E test error: "Failed to fetch dynamically imported module"
    // Ensures env.config.ts resolves correctly in test environment
    const path = require('path');
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/lib/env.config': path.resolve(__dirname, 'src/lib/env.config.ts'),
    };

    return config;
  },
};

module.exports = nextConfig;
