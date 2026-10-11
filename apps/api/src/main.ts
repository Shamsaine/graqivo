import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseEnvironment } from './config/environment';
async function bootstrap() {
  const config = parseEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({origin: config.origins, credentials: true});
  app.useGlobalPipes(new ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true}));
  app.enableShutdownHooks();
  await app.listen(config.PORT, '127.0.0.1');
}
bootstrap().catch((error: unknown) => { console.error(error instanceof Error && error.message.startsWith('Invalid configuration:') ? error.message : 'API startup failed. Check configuration and service availability.'); process.exitCode = 1; });
