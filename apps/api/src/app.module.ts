import { ProjectsService } from './projects/projects.service.js';
import { ProjectsController } from './projects/projects.controller.js';
import { ResourcesService } from './resources/resources.service.js';
import {
  ResourcesController,
  ResourceUploadGuard,
} from './resources/resources.controller.js';
import { StorageService } from './storage/storage.service.js';
import { StorageCleanupService } from './storage/storage-cleanup.service.js';
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
  controllers: [
    HealthController,
    MeController,
    WorkspacesController,
    ProjectsController,
    ResourcesController,
  ],
  providers: [
    PrismaService,
    AuthService,
    SessionGuard,
    EmailService,
    PermissionsService,
    WorkspacesService,
    ProjectsService,
    ResourcesService,
    ResourceUploadGuard,
    StorageService,
    StorageCleanupService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
