import 'reflect-metadata';

import { type INestApplication, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

export { AppModule };
import { APP_CONFIG, type AppConfig } from './shared/config/env';
import { requestContextMiddleware } from './shared/http/request-context';

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
      .setTitle('BioAuth Optimizer API')
      .setDescription(
        'Оптимизация порога (формула 1 СРО1) и состава факторов (формулы 2–3 СРО1) биометрической аутентификации. ' +
          'Ошибки — RFC 7807 application/problem+json.',
      )
      .setVersion('3.0.0')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  return app;
}
