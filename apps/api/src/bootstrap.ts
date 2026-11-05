import 'reflect-metadata';

import { dirname, join } from 'node:path';

import { type INestApplication, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

export { AppModule };
import { APP_CONFIG, type AppConfig } from './shared/config/env';
import { requestContextMiddleware } from './shared/http/request-context';

/** Версия из package.json — та же, что у релиза. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const API_VERSION = (require('../package.json') as { version: string }).version;

/** Цвета справочника Scalar — те же, что в интерфейсе: чернила, бумага, синий FRR, зелёный оптимум. */
const SCALAR_CSS = `
.light-mode {
  --scalar-color-1: #17202b; --scalar-color-2: #56606d; --scalar-color-3: #7a838e;
  --scalar-color-accent: #1e5f8c; --scalar-background-1: #fbfcfa; --scalar-background-2: #f3f5f2;
  --scalar-background-3: #e9ede8; --scalar-border-color: #d5dbd4;
  --scalar-color-green: #2e7d4f; --scalar-color-red: #b3263e; --scalar-color-blue: #1e5f8c;
}
.dark-mode {
  --scalar-color-1: #e4e9ee; --scalar-color-2: #96a1ad; --scalar-color-3: #6f7b88;
  --scalar-color-accent: #6db1e2; --scalar-background-1: #0e1318; --scalar-background-2: #151c23;
  --scalar-background-3: #1d262f; --scalar-border-color: #27313b;
  --scalar-color-green: #5cc58c; --scalar-color-red: #ef6a82; --scalar-color-blue: #6db1e2;
}
body { font-family: 'Golos Text', system-ui, sans-serif; }
/* Облачные функции Scalar (SDK, MCP) не нужны локальному справочнику и требуют интернет. */
.explore-scalar-card, .explore-scalar-cta, .generate-sdk-button,
button[aria-haspopup="dialog"].text-c-1.px-3.py-1 { display: none !important; }
`;

/** HTML справочника: сборка Scalar с этого же сервера и конфигурация (JSON, без пользовательских данных). */
function scalarPage(config: Record<string, unknown>): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BioAuth API</title>
    <style>${SCALAR_CSS}</style>
  </head>
  <body>
    <div id="app"></div>
    <script src="/api/docs/assets/standalone.js"></script>
    <script>Scalar.createApiReference('#app', ${json});</script>
  </body>
</html>`;
}

/** Сборка приложения отдельно от прослушивания порта — используется и в main.ts, и в e2e-тестах. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  return configureApp(app);
}

/** Общая настройка HTTP-слоя; e2e-тесты применяют её к приложению с подменёнными адаптерами. */
export function configureApp(nest: INestApplication): INestApplication {
  const app = nest as NestExpressApplication;
  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(APP_CONFIG);
  // Кадры камеры передаются в JSON (base64): до 16 кадров по ~200 КБ с запасом.
  app.useBodyParser('json', { limit: '20mb' });
  // Конечная точка токенов OAuth принимает application/x-www-form-urlencoded (RFC 6749).
  app.useBodyParser('urlencoded', { extended: false, limit: '64kb' });
  // web (Next.js) проксирует запросы из той же сети: его X-Forwarded-For — адрес пользователя.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(requestContextMiddleware);
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/(.*)', method: RequestMethod.GET },
      { path: '.well-known/(.*)', method: RequestMethod.ALL },
      { path: 'oidc/(.*)', method: RequestMethod.ALL },
    ],
  });
  // Конечные точки OIDC (токены, userinfo, JWKS) вызываются приложениями с других адресов и без cookie;
  // остальной API — только с адреса интерфейса.
  app.enableCors(
    (
      req: { url?: string },
      cb: (err: Error | null, o: { origin: string | boolean; credentials?: boolean }) => void,
    ) => {
      const open = /^\/(oidc\/(token|userinfo|jwks|introspect|revoke)|\.well-known\/)/.test(req.url ?? '');
      cb(null, open ? { origin: '*', credentials: false } : { origin: config.CORS_ORIGIN });
    },
  );
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BioAuth API')
      .setDescription(
        [
          'Сервер биометрической аутентификации BioAuth: оптимизация порога (формула 1 СРО1) и состава факторов',
          '(формулы 2–3 СРО1), регистрация и вход по лицу с passkey, калибровка, учётные записи и админ-панель.',
          '',
          '**Аутентификация.** Сессия — httpOnly cookie `bioauth_session` после входа (`POST /api/v1/identity/login`',
          'или вход по лицу); запросы с cookie принимаются только с адреса интерфейса.',
          '',
          '**OpenID Connect.** Конечные точки сервера авторизации (без префикса `/api/v1`, ответы об ошибках — RFC 6749):',
          '`/.well-known/openid-configuration`, `/oidc/authorize`, `/oidc/token`, `/oidc/userinfo`, `/oidc/jwks`,',
          '`/oidc/introspect`, `/oidc/revoke`, `/oidc/logout`. Публичный адрес издателя — адрес интерфейса.',
          '',
          '**Ошибки** REST API — RFC 7807 `application/problem+json`. Спецификация: `/api/openapi.json`.',
        ].join('\n'),
      )
      .setVersion(API_VERSION)
      .build(),
  );
  // Документация API — Scalar. Сборка интерфейса Scalar раздаётся самим сервером, без CDN:
  // справочник открывается и без интернета (защита на ноутбуке в режиме make up-offline).
  const sendSpec = (_req: Request, res: Response) => res.json(document);
  const http: Express = app.getHttpAdapter().getInstance();
  http.get('/api/openapi.json', sendSpec);
  http.get('/api/docs-json', sendSpec); // прежний адрес спецификации (совместимость)
  app.useStaticAssets(join(dirname(require.resolve('@scalar/api-reference')), 'browser'), {
    prefix: '/api/docs/assets/',
    immutable: true,
    maxAge: '7d',
  });
  const page = scalarPage({
    url: '/api/openapi.json',
    layout: 'modern',
    theme: 'default',
    withDefaultFonts: false,
    telemetry: false,
    showToolbar: 'never',
    showDeveloperTools: 'never',
    defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
    metaData: { title: 'BioAuth API', description: 'REST API и OpenID Connect BioAuth' },
    // ИИ-ассистент Scalar обращается к облаку — отключён.
    agent: { disabled: true },
  });
  http.get(['/api/docs', '/api/docs/'], (_req: Request, res: Response) => {
    res.type('html').setHeader('cache-control', 'no-cache').send(page);
  });
  return app;
}
