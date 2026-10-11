import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
});
export function parseEnvironment(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  const origins = result.data.CORS_ALLOWED_ORIGINS.split(',').map((s) =>
    s.trim(),
  );
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol))
      throw new Error('CORS origins must be exact HTTP(S) origins');
    if (result.data.NODE_ENV === 'production' && url.protocol !== 'https:')
      throw new Error('Production requires HTTPS origins');
  }
  return { ...result.data, origins };
}
