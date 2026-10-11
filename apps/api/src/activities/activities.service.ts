import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { ActivityQuery } from './activities.dto.js';
@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
  ) {}
  async context(
    slug: string,
    userId: string,
    db: Prisma.TransactionClient = this.db,
  ) {
    const organization = await db.organization.findUnique({ where: { slug } });
    if (!organization) throw new NotFoundException('Workspace unavailable');
    return {
      organization,
      member: await this.permissions.membership(db, organization.id, userId),
    };
  }
  scope(
    organizationId: string,
    member: { id: string; role: string },
  ): Prisma.ActivityWhereInput {
    return {
      organizationId,
      OR: [
        { visibility: 'WORKSPACE' },
        ...(member.role !== 'MEMBER' ? [{ visibility: 'ADMIN' as const }] : []),
        {
          visibility: 'PROJECT',
          project: this.permissions.projectScope(organizationId, member),
        },
        {
          visibility: 'RESOURCE',
          resource: this.permissions.resourceScope(organizationId, member),
        },
      ],
    };
  }
  async list(slug: string, userId: string, query: ActivityQuery) {
    return this.db.$transaction(
      async (db) => {
        const { organization, member } = await this.context(slug, userId, db);
        const and: Prisma.ActivityWhereInput[] = [
          this.scope(organization.id, member),
        ];
        if (query.projectId) {
          if (
            !(await db.project.count({
              where: {
                ...this.permissions.projectScope(organization.id, member),
                id: query.projectId,
              },
            }))
          )
            throw new NotFoundException('Project unavailable');
          and.push({ projectId: query.projectId });
        }
        if (query.resourceId) {
          if (
            !(await db.resource.count({
              where: {
                ...this.permissions.resourceScope(organization.id, member),
                id: query.resourceId,
              },
            }))
          )
            throw new NotFoundException('Resource unavailable');
          and.push({ resourceId: query.resourceId });
        }
        if (query.actorId) and.push({ actorMembershipId: query.actorId });
        const where = { AND: and };
        const total = await db.activity.count({ where });
        const rows = await db.activity.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true,
            action: true,
            createdAt: true,
            visibility: true,
            actor: { select: { user: { select: { name: true } } } },
            project: { select: { id: true, name: true } },
            resource: { select: { id: true, title: true } },
          },
        });
        const visibleProjects = new Set(
          (
            await db.project.findMany({
              where: this.permissions.projectScope(organization.id, member),
              select: { id: true },
            })
          ).map((p) => p.id),
        );
        return {
          total,
          page: query.page,
          limit: query.limit,
          items: rows.map((row) => ({
            ...row,
            project:
              row.project && visibleProjects.has(row.project.id)
                ? row.project
                : null,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
