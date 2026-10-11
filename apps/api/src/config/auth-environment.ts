import { z } from 'zod';
import { parseEnvironment } from './environment.js';
export function parseAuthEnvironment(input: Record<string, unknown>) {
  const base = parseEnvironment(input);
  const parsed = z
    .object({
      BETTER_AUTH_SECRET: z
        .string()
        .min(32)
        .refine(
          (value) =>
            !/^(.)\1+$/.test(value) &&
            !/replace|placeholder|your_secret/i.test(value),
        ),
      BETTER_AUTH_URL: z.string().url(),
      SMTP_HOST: z.string().min(1),
      SMTP_PORT: z.coerce.number().int().min(1).max(65535),
      SMTP_SECURE: z.enum(['true', 'false']).default('false'),
      SMTP_USERNAME: z.string().optional(),
      SMTP_PASSWORD: z.string().optional(),
      EMAIL_FROM_ADDRESS: z.string().email(),
      EMAIL_FROM_NAME: z.string().default('Graqivo'),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new Error(
      'Invalid configuration: ' +
        parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  const config = { ...base, ...parsed.data };
  if (!config.origins.includes(new URL(config.FRONTEND_URL).origin))
    throw new Error(
      'Invalid configuration: FRONTEND_URL must be an allowed origin',
    );
  if (!['http:', 'https:'].includes(new URL(config.BETTER_AUTH_URL).protocol))
    throw new Error('Invalid configuration: BETTER_AUTH_URL protocol');
  if (
    config.NODE_ENV === 'production' &&
    (!config.BETTER_AUTH_URL.startsWith('https://') ||
      !config.FRONTEND_URL.startsWith('https://') ||
      ['localhost', '127.0.0.1', 'mailpit'].includes(config.SMTP_HOST) ||
      !config.SMTP_USERNAME ||
      !config.SMTP_PASSWORD ||
      (config.SMTP_SECURE !== 'true' && config.SMTP_PORT !== 587))
  )
    throw new Error(
      'Invalid configuration: production requires HTTPS and authenticated TLS SMTP',
    );
  return config;
}
export type AuthEnvironment = ReturnType<typeof parseAuthEnvironment>;
