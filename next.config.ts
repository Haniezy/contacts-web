import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Native modules of the API (password hashing, image processing).
  serverExternalPackages: ['argon2', 'sharp'],
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
};

export default createNextIntlPlugin()(nextConfig);
