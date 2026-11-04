import path from 'node:path';

import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@bioauth/contracts'],
  poweredByHeader: false,
  // ESLint запускается отдельно (pnpm lint, CI) с общей конфигурацией монорепозитория.
  eslint: { ignoreDuringBuilds: true },
  // Браузер обращается к /api/* на том же origin — CORS не нужен (ADR-0004).
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
};

export default config;
