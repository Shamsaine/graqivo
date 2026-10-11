import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './database/prisma.service.js';
import { HealthController } from './health/health.controller.js';
import { AuthService } from './auth/auth.service.js';
import { SessionGuard } from './auth/session.guard.js';
import { MeController } from './auth/me.controller.js';
import { EmailService } from './email/email.service.js';
import { PermissionsService } from './permissions/permissions.service.js';
import { WorkspacesService } from './organizations/workspaces.service.js';
import { WorkspacesController } from './organizations/workspaces.controller.js';
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [HealthController, MeController, WorkspacesController],
  providers: [
    PrismaService,
    AuthService,
    SessionGuard,
    EmailService,
    PermissionsService,
    WorkspacesService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
