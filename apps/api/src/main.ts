import 'reflect-metadata';
import 'dotenv/config';
import { createApplication } from './create-app.js';
async function bootstrap() {
  const app = await createApplication();
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}
bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  console.error(
    `API startup failed: ${message.replace(/:\/\/[^/@\s]+@/g, '://[redacted]@')}`,
  );
  process.exitCode = 1;
});
