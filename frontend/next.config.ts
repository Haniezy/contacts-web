import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
};

export default createNextIntlPlugin()(nextConfig);
