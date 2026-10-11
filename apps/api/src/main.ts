import 'reflect-metadata';
import 'dotenv/config';
import { createApplication } from './create-app.js';
async function bootstrap() {
  const app = await createApplication();
  await app.listen(Number(process.env.PORT ?? 4000), '127.0.0.1');
}
bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith('Invalid configuration:')
      ? error.message
      : 'API startup failed. Check configuration and service availability.',
  );
  process.exitCode = 1;
});
