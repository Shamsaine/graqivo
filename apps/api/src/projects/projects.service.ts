import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type {
  SettingsDto,
  CreateProjectDto,
  UpdateProjectDto,
  ProjectMemberDto,
} from './projects.dto.js';
const person = { id: true, name: true, email: true, image: true } as const;
const projectInclude = {
  _count: { select: { resources: { where: { status: 'ACTIVE' as const } } } },
  lead: { select: { id: true, status: true, user: { select: person } } },
  memberships: {
    where: { membership: { status: 'ACTIVE' as const } },
    select: {
      id: true,
      membershipId: true,
      role: true,
      membership: { select: { user: { select: person } } },
    },
  },
} as const;
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
  ) {}
  async access(
    slug: string,
    userId: string,
    db: Prisma.TransactionClient = this.db,
  ) {
    const organization = await db.organization.findUnique({ where: { slug } });
    if (!organization) throw new NotFoundException('Workspace unavailable');
    const member = await this.permissions.membership(
      db,
      organization.id,
      userId,
    );
    return { organization, member };
  }
  scope(
    organizationId: string,
    member: { id: string; role: string },
  ): Prisma.ProjectWhereInput {
    return this.permissions.projectScope(organizationId, member);
  }
  async projects(slug: string, userId: string) {
    const { organization, member } = await this.access(slug, userId);
    return this.db.project.findMany({
      where: this.scope(organization.id, member),
      include: projectInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }
  async detail(slug: string, id: string, userId: string) {
    const { organization, member } = await this.access(slug, userId);
    const project = await this.db.project.findFirst({
      where: { ...this.scope(organization.id, member), id },
      include: projectInclude,
    });
    if (!project) throw new NotFoundException('Project unavailable');
    const events = await this.db.projectEvent.findMany({
      where: { organizationId: organization.id, projectId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { user: { select: { name: true } } } },
      },
    });
    return { ...project, events };
  }
  async overview(slug: string, userId: string) {
    const { organization, member } = await this.access(slug, userId);
    const scope = this.scope(organization.id, member);
    const [activeCount, projects, events] = await Promise.all([
      this.db.project.count({ where: { ...scope, status: 'ACTIVE' } }),
      this.db.project.findMany({
        where: { ...scope, status: { notIn: ['ARCHIVED', 'COMPLETED'] } },
        include: projectInclude,
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.db.projectEvent.findMany({
        where: { organizationId: organization.id, project: scope },
        select: {
          id: true,
          action: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
          actor: { select: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const resourceScope = {
      ...this.permissions.resourceScope(organization.id, member),
      status: 'ACTIVE' as const,
    };
    const [resourceCount, recentResources] = await Promise.all([
      this.db.resource.count({ where: resourceScope }),
      this.db.resource.findMany({
        where: resourceScope,
        select: { id: true, title: true, type: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);
    return {
      activeProjectCount: activeCount,
      projects,
      events,
      resources: resourceCount,
      recentResources,
      pendingReviews: null,
    };
  }
  async people(slug: string, userId: string) {
    const { organization, member } = await this.access(slug, userId);
    return this.db.organizationMembership.findMany({
      where: { organizationId: organization.id, status: 'ACTIVE' },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: person },
        projectMemberships: {
          where: { project: this.scope(organization.id, member) },
          select: {
            role: true,
            project: {
              select: {
                id: true,
                name: true,
                status: true,
                leadMembershipId: true,
              },
            },
          },
        },
        projectEvents: {
          where: { project: this.scope(organization.id, member) },
          select: {
            id: true,
            action: true,
            createdAt: true,
            project: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { user: { name: 'asc' } },
    });
  }
  async settings(slug: string, userId: string, dto: SettingsDto) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.access(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const actor = await this.permissions.membership(
        db,
        organization.id,
        userId,
      );
      if (actor.role !== 'OWNER')
        throw new ForbiddenException(
          'Only Owners can change workspace settings',
        );
      if (dto.name !== undefined && (!dto.name || dto.name.trim().length < 2))
        throw new BadRequestException(
          'Workspace name must contain at least two characters',
        );
      const updated = await db.organization.update({
        where: { id: organization.id },
        data: {
          ...dto,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        },
      });
      await db.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorId: userId,
          action: 'WORKSPACE_SETTINGS_UPDATED',
          targetId: organization.id,
        },
      });
      return updated;
    });
  }
  date(value: string | null | undefined) {
    if (value == null) return value;
    const date = new Date(value + 'T00:00:00.000Z');
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Enter valid calendar dates');
    return date;
  }
  async event(
    db: Prisma.TransactionClient,
    organizationId: string,
    projectId: string,
    actor: { id: string; userId: string },
    action: string,
  ) {
    await db.projectEvent.create({
      data: { organizationId, projectId, actorMembershipId: actor.id, action },
    });
    await db.auditEvent.create({
      data: {
        organizationId,
        actorId: actor.userId,
        action,
        targetId: projectId,
      },
    });
  }
  async save(
    slug: string,
    userId: string,
    dto: CreateProjectDto | UpdateProjectDto,
    id?: string,
  ) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.access(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const actor = await this.permissions.membership(
        db,
        organization.id,
        userId,
      );
      this.permissions.requireManager(actor.role);
      const existing = id
        ? await db.project.findFirst({
            where: { organizationId: organization.id, id },
          })
        : null;
      if (id && !existing) throw new NotFoundException('Project unavailable');
      if (dto.name !== undefined && (!dto.name || dto.name.trim().length < 2))
        throw new BadRequestException(
          'Project name must contain at least two characters',
        );
      const start =
        dto.startDate === undefined
          ? existing?.startDate
          : this.date(dto.startDate);
      const target =
        dto.targetDate === undefined
          ? existing?.targetDate
          : this.date(dto.targetDate);
      if (start && target && start > target)
        throw new BadRequestException(
          'Target date must be on or after the start date',
        );
      const leadId =
        dto.leadMembershipId === undefined
          ? existing?.leadMembershipId
          : dto.leadMembershipId;
      if (leadId) {
        const lead = await db.organizationMembership.findFirst({
          where: {
            id: leadId,
            organizationId: organization.id,
            status: 'ACTIVE',
          },
        });
        if (!lead)
          throw new BadRequestException(
            'Project lead must be an active workspace member',
          );
      }
      const status = dto.status ?? existing?.status ?? ProjectStatus.PLANNING;
      const data = {
        name: dto.name?.trim(),
        description: dto.description,
        leadMembershipId: leadId ?? null,
        startDate: start ?? null,
        targetDate: target ?? null,
        status,
        archivedAt:
          status === 'ARCHIVED' ? (existing?.archivedAt ?? new Date()) : null,
      };
      const project = existing
        ? await db.project.update({ where: { id: existing.id }, data })
        : await db.project.create({
            data: {
              ...data,
              name: data.name!,
              organizationId: organization.id,
              createdById: actor.id,
            },
          });
      if (!existing)
        await db.projectMembership.create({
          data: {
            organizationId: organization.id,
            projectId: project.id,
            membershipId: actor.id,
            role: 'CONTRIBUTOR',
          },
        });
      if (leadId)
        await db.projectMembership.upsert({
          where: {
            projectId_membershipId: {
              projectId: project.id,
              membershipId: leadId,
            },
          },
          create: {
            organizationId: organization.id,
            projectId: project.id,
            membershipId: leadId,
            role: 'CONTRIBUTOR',
          },
          update: { role: 'CONTRIBUTOR' },
        });
      await this.event(
        db,
        organization.id,
        project.id,
        actor,
        !existing
          ? 'PROJECT_CREATED'
          : status === 'ARCHIVED' && existing.status !== 'ARCHIVED'
            ? 'PROJECT_ARCHIVED'
            : 'PROJECT_UPDATED',
      );
      return project;
    });
  }
  async member(
    slug: string,
    id: string,
    userId: string,
    dto: ProjectMemberDto,
    remove = false,
  ) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.access(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const actor = await this.permissions.membership(
        db,
        organization.id,
        userId,
      );
      this.permissions.requireManager(actor.role);
      const project = await db.project.findFirst({
        where: { id, organizationId: organization.id },
      });
      if (!project) throw new NotFoundException('Project unavailable');
      if (project.status === 'ARCHIVED')
        throw new BadRequestException(
          'Restore this project before changing participants',
        );
      const member = await db.organizationMembership.findFirst({
        where: {
          id: dto.membershipId,
          organizationId: organization.id,
          status: 'ACTIVE',
        },
      });
      if (!member)
        throw new BadRequestException(
          'Participant must be an active workspace member',
        );
      if (
        project.leadMembershipId === member.id &&
        (remove || dto.role === 'VIEWER')
      )
        throw new BadRequestException(
          'Reassign or clear the lead before changing their membership',
        );
      if (remove) {
        const result = await db.projectMembership.deleteMany({
          where: {
            organizationId: organization.id,
            projectId: id,
            membershipId: member.id,
          },
        });
        if (!result.count)
          throw new NotFoundException('Project participant unavailable');
      } else
        await db.projectMembership.upsert({
          where: {
            projectId_membershipId: { projectId: id, membershipId: member.id },
          },
          create: {
            organizationId: organization.id,
            projectId: id,
            membershipId: member.id,
            role: dto.role,
          },
          update: { role: dto.role },
        });
      await db.project.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await this.event(
        db,
        organization.id,
        id,
        actor,
        remove ? 'PROJECT_PARTICIPANT_REMOVED' : 'PROJECT_PARTICIPANT_UPDATED',
      );
      return { success: true };
    });
  }
}
