import 'reflect-metadata';

import { type INestApplication, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './shared/config/env';

/** Сборка приложения отдельно от прослушивания порта — используется и в main.ts, и в e2e-тестах. */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'health/(.*)', method: RequestMethod.GET }] });
  app.enableCors({ origin: config.CORS_ORIGIN });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BioAuth Optimizer API')
      .setDescription(
        'Оптимизация порога (формула 1 СРО1) и состава факторов (формулы 2–3 СРО1) биометрической аутентификации. ' +
          'Ошибки — RFC 7807 application/problem+json.',
      )
      .setVersion('1.0.0')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  return app;
}
