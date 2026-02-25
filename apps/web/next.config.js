/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export', // Commented out to prevent dev server issues
  // No assetPrefix needed for app:// protocol
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  transpilePackages: ['@keimenon/types', '@keimenon/ui'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  webpack: (config, { isServer }) => {
    config.externals = [...(config.externals || []), { keimenon: 'keimenon' }];

    // Externalize Node.js modules for client-side bundles
    // policy-loader from @keimenon/types uses fs/path - only works server-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

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
