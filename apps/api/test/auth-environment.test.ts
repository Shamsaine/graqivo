import { describe, expect, it } from 'vitest';
import { parseAuthEnvironment } from '../src/config/auth-environment.js';

const baseEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/graqivo',
  FRONTEND_URL: 'http://localhost:3000',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'test-secret-with-more-than-thirty-two-characters',
  BETTER_AUTH_URL: 'http://localhost:4000',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  EMAIL_FROM_ADDRESS: 'no-reply@example.test',
};

describe('auth environment', () => {
  it('allows Google OAuth to be omitted', () => {
    const config = parseAuthEnvironment(baseEnvironment);

    expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(config.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it('requires both Google OAuth credentials', () => {
    expect(() =>
      parseAuthEnvironment({
        ...baseEnvironment,
        GOOGLE_CLIENT_ID: 'google-client-id',
      }),
    ).toThrow('GOOGLE_CLIENT_ID');
  });

  it('accepts a complete Google OAuth configuration', () => {
    const config = parseAuthEnvironment({
      ...baseEnvironment,
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:4000/api/auth/callback/google',
    });

    expect(config.GOOGLE_CLIENT_ID).toBe('google-client-id');
    expect(config.GOOGLE_CLIENT_SECRET).toBe('google-client-secret');
    expect(config.GOOGLE_CALLBACK_URL).toBe(
      'http://localhost:4000/api/auth/callback/google',
    );
  });
});
