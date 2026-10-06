import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Native modules of the API (password hashing, image processing).
  serverExternalPackages: ['argon2', 'sharp'],
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // The service worker is checked on every visit, so a new version of the
  // installed app arrives at once.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin()(nextConfig);
