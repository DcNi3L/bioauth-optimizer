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
  // Браузер обращается к /api/* на том же origin — CORS не нужен (ADR-0004). Конечные точки OpenID Connect
  // (/oidc/*, /.well-known/*) тоже открываются на адресе интерфейса: он и есть издатель (issuer).
  rewrites() {
    return Promise.resolve([
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/oidc/:path*', destination: `${apiUrl}/oidc/:path*` },
      { source: '/.well-known/:path*', destination: `${apiUrl}/.well-known/:path*` },
    ]);
  },
  // Адреса v2 сохраняются: закладки и ссылки из документации ведут на вкладки «Алгоритма».
  redirects() {
    const to = (source: string, destination: string) => ({ source, destination, permanent: false });
    return Promise.resolve([
      to('/threshold', '/algorithm/threshold'),
      to('/factors', '/algorithm/factors'),
      to('/experiments', '/algorithm/history'),
      to('/experiments/:id', '/algorithm/history/:id'),
      to('/admin/calibration', '/algorithm/calibration'),
      to('/admin/report', '/algorithm/protocol'),
      to('/admin/batch', '/algorithm/batch'),
      to('/admin/pad-test', '/algorithm/pad'),
    ]);
  },
};

export default config;
