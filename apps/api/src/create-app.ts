import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module.js';
import { AuthService } from './auth/auth.service.js';
import { PrismaService } from './database/prisma.service.js';
import { parseAuthEnvironment } from './config/auth-environment.js';
export async function createApplication(quiet = false) {
  const config = parseAuthEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    ...(quiet ? { logger: false as const } : {}),
  });
  app.use(helmet());
  app.enableCors({ origin: config.origins, credentials: true });
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.use((req, res, next) => {
    // This header is overwritten by the server; client-provided proxy headers never select a rate-limit identity.
    req.headers['x-graqivo-client-ip'] = req.socket.remoteAddress ?? 'unknown';
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      if (
        !req.headers.origin ||
        !config.origins.includes(req.headers.origin) ||
        !req.is('application/json')
      ) {
        res.status(403).json({
          statusCode: 403,
          message: 'Request origin or content type rejected',
        });
        return;
      }
    }
    if (req.path === '/api/auth/sign-in/email')
      res.on('finish', () => {
        if ([401, 403].includes(res.statusCode))
          void app
            .get(PrismaService)
            .auditEvent.create({
              data: {
                action: 'AUTHENTICATION_REJECTED',
                metadata: { status: res.statusCode },
              },
            })
            .catch(() => console.error('Security event recording failed'));
      });
    next();
  });
  server.all(
    ['/api/auth', '/api/auth/{*path}'],
    toNodeHandler(app.get(AuthService).auth),
  );
  server.use(express.json({ limit: '16kb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  return app;
}
