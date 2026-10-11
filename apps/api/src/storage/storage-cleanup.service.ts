import {
  Inject,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { StorageService } from './storage.service.js';
@Injectable()
export class StorageCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}
  async enqueue(db: Prisma.TransactionClient, key: string, delay = 0) {
    return db.storageDeletion.upsert({
      where: { key },
      create: { key, availableAt: new Date(Date.now() + delay) },
      update: { status: 'PENDING', availableAt: new Date(Date.now() + delay) },
    });
  }
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.drain();
    }, 5000);
    this.timer.unref();
  }
  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  onModuleDestroy() {
    this.stopTimer();
    this.storage.client.destroy();
  }
  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.db.storageDeletion.updateMany({
        where: {
          status: 'PROCESSING',
          claimedAt: { lt: new Date(Date.now() - 60000) },
        },
        data: { status: 'PENDING' },
      });
      const jobs = await this.db.storageDeletion.findMany({
        where: { status: 'PENDING', availableAt: { lte: new Date() } },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });
      for (const job of jobs) {
        const claim = await this.db.storageDeletion.updateMany({
          where: { id: job.id, status: 'PENDING' },
          data: {
            status: 'PROCESSING',
            claimedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        if (!claim.count) continue;
        try {
          await this.storage.remove(job.key);
          await this.db.$transaction(async (db) => {
            await db.resource.updateMany({
              where: { objectKey: job.key, uploadState: 'UPLOADING' },
              data: { uploadState: 'FAILED', objectKey: null },
            });
            await db.resource.updateMany({
              where: { objectKey: job.key, uploadState: 'DELETING' },
              data: { uploadState: 'DELETED', objectKey: null },
            });
            await db.storageDeletion.delete({ where: { id: job.id } });
          });
        } catch {
          await this.db.storageDeletion.update({
            where: { id: job.id },
            data: {
              status: job.attempts >= 9 ? 'FAILED' : 'PENDING',
              availableAt: new Date(
                Date.now() + Math.min(3600, 2 ** job.attempts) * 1000,
              ),
            },
          });
          console.error(
            'Private storage deletion deferred; inspect cleanup job status.',
          );
        }
      }
    } catch {
      console.error('Private storage cleanup unavailable; retrying later.');
    } finally {
      this.busy = false;
    }
  }
}
