import path from 'node:path';

import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@bioauth/contracts'],
  poweredByHeader: false,
  // Браузер обращается к /api/* на том же origin — CORS не нужен (ADR-0004). Конечные точки OpenID Connect
  // (/oidc/*, /.well-known/*) тоже открываются на адресе интерфейса: он и есть издатель (issuer).
  rewrites() {
    return Promise.resolve([
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/oidc/:path*', destination: `${apiUrl}/oidc/:path*` },
      { source: '/.well-known/:path*', destination: `${apiUrl}/.well-known/:path*` },
    ]);
  },
  headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      // Камера и passkey нужны только самому сайту.
      {
        key: 'Permissions-Policy',
        value:
          'camera=(self), publickey-credentials-get=(self), publickey-credentials-create=(self), microphone=(), geolocation=()',
      },
    ];
    return Promise.resolve([
      { source: '/:path*', headers: security },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
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
