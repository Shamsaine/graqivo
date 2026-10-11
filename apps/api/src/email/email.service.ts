import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import nodemailer from 'nodemailer';
import { PrismaService } from '../database/prisma.service.js';
import { parseAuthEnvironment } from '../config/auth-environment.js';
export interface Message {
  to: string;
  subject: string;
  text: string;
}
@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly config = parseAuthEnvironment(process.env);
  private readonly key = createHash('sha256')
    .update(this.config.BETTER_AUTH_SECRET)
    .digest();
  private readonly transport = nodemailer.createTransport({
    host: this.config.SMTP_HOST,
    port: this.config.SMTP_PORT,
    secure: this.config.SMTP_SECURE === 'true',
    requireTLS: this.config.NODE_ENV === 'production',
    auth: this.config.SMTP_USERNAME
      ? { user: this.config.SMTP_USERNAME, pass: this.config.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async send(message: Message) {
    await this.enqueue(this.prisma, message);
  }
  async enqueue(db: Prisma.TransactionClient, message: Message) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(message), 'utf8'),
      cipher.final(),
    ]);
    return db.emailOutbox.create({
      data: {
        payload: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
          'base64',
        ),
      },
    });
  }
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.drain();
    }, 1000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.transport.close();
  }
  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      await this.prisma.emailOutbox.updateMany({
        where: {
          status: 'PROCESSING',
          claimedAt: { lt: new Date(Date.now() - 60000) },
        },
        data: { status: 'PENDING' },
      });
      const jobs = await this.prisma.emailOutbox.findMany({
        where: { status: 'PENDING', availableAt: { lte: now } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const job of jobs) {
        const claim = await this.prisma.emailOutbox.updateMany({
          where: { id: job.id, status: 'PENDING' },
          data: {
            status: 'PROCESSING',
            claimedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        if (!claim.count) continue;
        try {
          const payload = Buffer.from(job.payload, 'base64');
          const decipher = createDecipheriv(
            'aes-256-gcm',
            this.key,
            payload.subarray(0, 12),
          );
          decipher.setAuthTag(payload.subarray(12, 28));
          const message = JSON.parse(
            Buffer.concat([
              decipher.update(payload.subarray(28)),
              decipher.final(),
            ]).toString('utf8'),
          ) as Message;
          await this.transport.sendMail({
            ...message,
            from: {
              name: this.config.EMAIL_FROM_NAME,
              address: this.config.EMAIL_FROM_ADDRESS,
            },
          });
          await this.prisma.emailOutbox.update({
            where: { id: job.id },
            data: { status: 'SENT', sentAt: new Date(), payload: '' },
          });
        } catch {
          await this.prisma.emailOutbox.update({
            where: { id: job.id },
            data: {
              status: job.attempts >= 9 ? 'FAILED' : 'PENDING',
              availableAt: new Date(
                Date.now() + Math.min(3600, 2 ** job.attempts) * 1000,
              ),
            },
          });
          console.error(
            'Email delivery deferred; inspect outbox status and SMTP configuration.',
          );
        }
      }
    } catch {
      console.error('Email queue unavailable; delivery will retry.');
    } finally {
      this.busy = false;
    }
  }
}
