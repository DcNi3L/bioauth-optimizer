import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: require('node:path').join(__dirname, '../../'),
  transpilePackages: ['@bioauth/contracts'],
  poweredByHeader: false,
  // Браузер обращается к /api/* на том же origin — CORS не нужен (ADR-0004).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
