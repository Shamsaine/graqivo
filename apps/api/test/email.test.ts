import 'reflect-metadata';
import 'dotenv/config';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { EmailService } from '../src/email/email.service.js';
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => smtp } }));
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/graqivo_test')
  throw new Error('Email tests require isolated graqivo_test database');
process.env.DATABASE_URL = url;
const db = new PrismaService();
const service = new EmailService(db);
const ids: string[] = [];
beforeAll(async () => {
  await db.$connect();
});
afterAll(async () => {
  service.onModuleDestroy();
  await db.emailOutbox.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
describe.sequential('Durable email delivery', () => {
  it('encrypts secrets, retries SMTP failures, and erases delivered payloads', async () => {
    const message = {
      to: 'queue-test@example.invalid',
      subject: 'Queue test',
      text: 'https://localhost/reset-password#token=private-test-token',
    };
    const job = await service.enqueue(db, message);
    ids.push(job.id);
    expect(job.payload).not.toContain(message.to);
    expect(job.payload).not.toContain('private-test-token');
    smtp.sendMail.mockRejectedValueOnce(new Error('simulated SMTP outage'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await service.drain();
    } finally {
      log.mockRestore();
    }
    const deferred = await db.emailOutbox.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(deferred.status).toBe('PENDING');
    expect(deferred.attempts).toBe(1);
    expect(deferred.sentAt).toBeNull();
    expect(deferred.payload).toBe(job.payload);
    await db.emailOutbox.update({
      where: { id: job.id },
      data: { availableAt: new Date(0) },
    });
    smtp.sendMail.mockResolvedValueOnce({ messageId: 'test' });
    await service.drain();
    expect(smtp.sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining(message),
    );
    const sent = await db.emailOutbox.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(sent.status).toBe('SENT');
    expect(sent.attempts).toBe(2);
    expect(sent.payload).toBe('');
    expect(sent.sentAt).not.toBeNull();
  });
  it('rolls back an email with its failed business transaction', async () => {
    let id = '';
    await expect(
      db.$transaction(async (tx) => {
        const job = await service.enqueue(tx, {
          to: 'rollback@example.invalid',
          subject: 'Rollback',
          text: 'Never deliver',
        });
        id = job.id;
        ids.push(id);
        throw new Error('business transaction failed');
      }),
    ).rejects.toThrow('business transaction failed');
    expect(await db.emailOutbox.findUnique({ where: { id } })).toBeNull();
  });
});
