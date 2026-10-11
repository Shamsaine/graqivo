import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { parseEnvironment } from '../src/config/environment.js';
const valid = {
  DATABASE_URL: 'postgresql://localhost/graqivo',
  FRONTEND_URL: 'http://localhost:3000',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};
describe('configuration', () => {
  it('rejects missing database configuration without exposing secrets', () => {
    expect(() => parseEnvironment({})).toThrow('DATABASE_URL');
  });
  it('rejects insecure production origins', () => {
    expect(() =>
      parseEnvironment({ ...valid, NODE_ENV: 'production' }),
    ).toThrow('HTTPS');
  });
  it('rejects wildcards', () => {
    expect(() =>
      parseEnvironment({ ...valid, CORS_ALLOWED_ORIGINS: '*' }),
    ).toThrow();
  });
  it('accepts exact local origins', () => {
    expect(parseEnvironment(valid).origins).toEqual(['http://localhost:3000']);
  });
});
describe('health HTTP contract', () => {
  async function appFor(available: boolean) {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: async () => {
              if (!available) throw new Error('private database information');
              return [{ value: 1 }];
            },
          },
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    return app;
  }
  it('serves liveness and database readiness', async () => {
    const app = await appFor(true);
    try {
      await request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'ok', service: 'graqivo-api' });
      await request(app.getHttpServer()).get('/health/ready').expect(200);
    } finally {
      await app.close();
    }
  });
  it('returns 503 without database error details', async () => {
    const app = await appFor(false);
    try {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);
      expect(JSON.stringify(res.body)).not.toContain('private database');
    } finally {
      await app.close();
    }
  });
});
