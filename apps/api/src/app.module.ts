import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './database/prisma.service';
import { HealthController } from './health/health.controller';
@Module({imports: [ThrottlerModule.forRoot([{ttl: 60000, limit: 120}])], controllers:[HealthController], providers:[PrismaService, {provide: APP_GUARD, useClass: ThrottlerGuard}]})
export class AppModule {}
