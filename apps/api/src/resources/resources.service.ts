import { recordAudit } from '../activities/activity-write.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, Resource, OrganizationMembership } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { StorageService } from '../storage/storage.service.js';
import { StorageCleanupService } from '../storage/storage-cleanup.service.js';
import { validateUpload, type UploadFile } from '../storage/file-validation.js';
import type {
  CreateResourceDto,
  UpdateResourceDto,
  RegistryQuery,
  GrantResourceDto,
} from './resources.dto.js';
const user = { id: true, name: true, email: true } as const;
const include = {
  owner: { select: { id: true, user: { select: user } } },
  createdBy: { select: { id: true, user: { select: user } } },
  project: { select: { id: true, name: true } },
  access: {
    where: { membership: { status: 'ACTIVE' as const } },
    select: {
      id: true,
      permission: true,
      membership: { select: { id: true, user: { select: user } } },
    },
  },
} as const;
@Injectable()
export class ResourcesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(StorageCleanupService)
    private readonly cleanup: StorageCleanupService,
  ) {}
  async context(
    slug: string,
    userId: string,
    db: Prisma.TransactionClient = this.db,
  ) {
    return this.projects.access(slug, userId, db);
  }
  async find(
    slug: string,
    id: string,
    userId: string,
    db: Prisma.TransactionClient = this.db,
  ) {
    const context = await this.context(slug, userId, db);
    const resource = await db.resource.findFirst({
      where: {
        ...this.permissions.resourceScope(
          context.organization.id,
          context.member,
        ),
        id,
      },
    });
    if (!resource) throw new NotFoundException('Resource unavailable');
    return { ...context, resource };
  }
  manage(member: OrganizationMembership, resource: Resource) {
    return (
      member.role !== 'MEMBER' ||
      resource.ownerMembershipId === member.id ||
      resource.createdById === member.id
    );
  }
  async rights(
    db: Prisma.TransactionClient,
    member: OrganizationMembership,
    resource: Resource,
  ) {
    const manage = this.manage(member, resource);
    const grants = await db.resourceAccess.findMany({
      where: {
        organizationId: resource.organizationId,
        resourceId: resource.id,
        membershipId: member.id,
      },
      select: { permission: true },
    });
    const participant = resource.projectId
      ? await db.projectMembership.findUnique({
          where: {
            projectId_membershipId: {
              projectId: resource.projectId,
              membershipId: member.id,
            },
          },
        })
      : null;
    return {
      view: true,
      edit:
        manage ||
        grants.some((grant) => grant.permission === 'EDIT') ||
        participant?.role === 'CONTRIBUTOR',
      review: manage || grants.some((grant) => grant.permission === 'REVIEW'),
      manageAccess: manage,
      delete: member.role !== 'MEMBER',
    };
  }
  async safe(
    resource: Resource & { project?: { id: string; name: string } | null },
    member: OrganizationMembership,
    db: Prisma.TransactionClient = this.db,
  ) {
    const { objectKey, projectId, ...data } = resource;
    void objectKey;
    const visible = projectId
      ? await db.project.count({
          where: {
            ...this.permissions.projectScope(resource.organizationId, member),
            id: projectId,
          },
        })
      : 0;
    return {
      ...data,
      project: visible ? resource.project : null,
      projectId: visible ? projectId : null,
      projectHidden: !!projectId && !visible,
      permissions: await this.rights(db, member, resource),
    };
  }
  async list(slug: string, userId: string, query: RegistryQuery) {
    const { organization, member } = await this.context(slug, userId);
    const and: Prisma.ResourceWhereInput[] = [
      this.permissions.resourceScope(organization.id, member),
    ];
    if (query.projectId) {
      if (
        !(await this.db.project.count({
          where: {
            ...this.permissions.projectScope(organization.id, member),
            id: query.projectId,
          },
        }))
      )
        throw new NotFoundException('Project unavailable');
      and.push({ projectId: query.projectId });
    }
    if (query.search)
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    if (query.type) and.push({ type: query.type });
    if (query.status) and.push({ status: query.status });
    if (query.reviewState) and.push({ reviewState: query.reviewState });
    if (query.mine === 'true') and.push({ createdById: member.id });
    if (query.unassigned === 'true') and.push({ projectId: null });
    if (query.personId)
      and.push({
        OR: [
          { ownerMembershipId: query.personId },
          { createdById: query.personId },
          {
            access: {
              some: {
                membershipId: query.personId,
                membership: { status: 'ACTIVE' },
              },
            },
          },
        ],
      });
    const where = { AND: and };
    const [total, items] = await this.db.$transaction(
      [
        this.db.resource.count({ where }),
        this.db.resource.findMany({
          where,
          include,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      total,
      page: query.page,
      limit: query.limit,
      items: await Promise.all(items.map((item) => this.safe(item, member))),
    };
  }
  async detail(slug: string, id: string, userId: string) {
    const { resource, member } = await this.find(slug, id, userId);
    const row = await this.db.resource.findUniqueOrThrow({
      where: { id },
      include,
    });
    const events = await this.db.resourceEvent.findMany({
      where: { organizationId: resource.organizationId, resourceId: id },
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { ...(await this.safe(row, member)), events };
  }
  url(value: string | undefined) {
    if (!value) throw new BadRequestException('Enter an external URL');
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new BadRequestException(
        'Use an HTTP or HTTPS link without credentials',
      );
    return url.toString();
  }
  async validateProject(
    db: Prisma.TransactionClient,
    organizationId: string,
    member: OrganizationMembership,
    projectId: string | null | undefined,
  ) {
    if (!projectId) return;
    const project = await db.project.findFirst({
      where: {
        ...this.permissions.projectScope(organizationId, member),
        id: projectId,
        status: { not: 'ARCHIVED' },
      },
    });
    if (!project)
      throw new BadRequestException(
        'Choose an accessible, non-archived project',
      );
    if (member.role === 'MEMBER') {
      const participant = await db.projectMembership.findUnique({
        where: {
          projectId_membershipId: { projectId, membershipId: member.id },
        },
      });
      if (participant?.role !== 'CONTRIBUTOR')
        throw new ForbiddenException(
          'Project resource changes require Contributor access',
        );
    }
  }
  async event(
    db: Prisma.TransactionClient,
    resource: Resource,
    member: OrganizationMembership,
    action: string,
  ) {
    await db.resourceEvent.create({
      data: {
        organizationId: resource.organizationId,
        resourceId: resource.id,
        actorMembershipId: member.id,
        action,
      },
    });
    await recordAudit(db, {
      data: {
        organizationId: resource.organizationId,
        actorId: member.userId,
        action,
        targetId: resource.id,
      },
    });
  }
  async create(slug: string, userId: string, dto: CreateResourceDto) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const member = await this.permissions.membership(
        db,
        organization.id,
        userId,
      );
      if (dto.title.trim().length < 2)
        throw new BadRequestException('Enter a resource title');
      await this.validateProject(db, organization.id, member, dto.projectId);
      const ownerId = dto.ownerMembershipId ?? member.id;
      if (ownerId !== member.id && member.role === 'MEMBER')
        throw new ForbiddenException(
          'Members create resources under their own ownership',
        );
      if (
        !(await db.organizationMembership.count({
          where: {
            organizationId: organization.id,
            id: ownerId,
            status: 'ACTIVE',
          },
        }))
      )
        throw new BadRequestException(
          'Owner must be an active workspace member',
        );
      if (dto.source === 'UPLOAD' && dto.externalUrl !== undefined)
        throw new BadRequestException(
          'Uploaded resources cannot contain an external URL',
        );
      const resource = await db.resource.create({
        data: {
          organizationId: organization.id,
          title: dto.title.trim(),
          description: dto.description,
          type: dto.type,
          source: dto.source,
          externalUrl:
            dto.source === 'EXTERNAL' ? this.url(dto.externalUrl) : null,
          projectId: dto.projectId ?? null,
          ownerMembershipId: ownerId,
          createdById: member.id,
          uploadState: dto.source === 'UPLOAD' ? 'PENDING' : 'NONE',
        },
      });
      await this.event(db, resource, member, 'RESOURCE_CREATED');
      return this.safe(resource, member, db);
    });
  }
  async update(
    slug: string,
    id: string,
    userId: string,
    dto: UpdateResourceDto,
  ) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const { resource, member } = await this.find(slug, id, userId, db);
      const rights = await this.rights(db, member, resource);
      if (!rights.edit)
        throw new ForbiddenException('Resource editing requires Edit access');
      if (
        resource.uploadState === 'UPLOADING' ||
        resource.uploadState === 'DELETING'
      )
        throw new ConflictException('Finish the file operation before editing');
      if (dto.title !== undefined && dto.title.trim().length < 2)
        throw new BadRequestException('Enter a resource title');
      if (dto.projectId !== undefined || dto.ownerMembershipId !== undefined) {
        if (!rights.manageAccess)
          throw new ForbiddenException(
            'Only resource owners, creators, or administrators can change assignment',
          );
        await this.validateProject(db, organization.id, member, dto.projectId);
        if (
          dto.ownerMembershipId &&
          !(await db.organizationMembership.count({
            where: {
              organizationId: organization.id,
              id: dto.ownerMembershipId,
              status: 'ACTIVE',
            },
          }))
        )
          throw new BadRequestException(
            'Owner must be an active workspace member',
          );
      }
      if (
        resource.source === 'UPLOAD' &&
        (dto.externalUrl !== undefined || dto.type !== undefined)
      )
        throw new BadRequestException(
          'Uploaded file type is determined by its validated content',
        );
      const changed =
        (dto.title !== undefined && dto.title.trim() !== resource.title) ||
        (dto.description !== undefined &&
          dto.description !== (resource.description ?? '')) ||
        (dto.externalUrl !== undefined &&
          this.url(dto.externalUrl) !== resource.externalUrl) ||
        (dto.type !== undefined && dto.type !== resource.type) ||
        (dto.projectId !== undefined && dto.projectId !== resource.projectId) ||
        (dto.ownerMembershipId !== undefined &&
          dto.ownerMembershipId !== resource.ownerMembershipId) ||
        (dto.status === 'ARCHIVED' && resource.status !== 'ARCHIVED');
      if (changed) {
        await db.reviewRequest.updateMany({
          where: { resourceId: id, status: 'PENDING' },
          data: { status: 'CANCELLED', completedAt: new Date() },
        });
        if (resource.reviewState !== 'NO_REVIEW')
          await this.event(db, resource, member, 'REVIEW_INVALIDATED');
      }
      const updated = await db.resource.update({
        where: { id },
        data: {
          ...dto,
          title: dto.title?.trim(),
          ...(changed ? { reviewState: 'NO_REVIEW' as const } : {}),
          externalUrl:
            dto.externalUrl === undefined
              ? undefined
              : this.url(dto.externalUrl),
          archivedAt:
            dto.status === undefined
              ? undefined
              : dto.status === 'ARCHIVED'
                ? new Date()
                : null,
        },
      });
      await this.event(
        db,
        updated,
        member,
        dto.status === 'ARCHIVED' ? 'RESOURCE_ARCHIVED' : 'RESOURCE_UPDATED',
      );
      return this.safe(updated, member, db);
    });
  }
  async grant(
    slug: string,
    id: string,
    userId: string,
    dto: GrantResourceDto,
    remove = false,
  ) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const { resource, member } = await this.find(slug, id, userId, db);
      if (!this.manage(member, resource))
        throw new ForbiddenException(
          'Only resource owners, creators, or administrators can manage grants',
        );
      if (
        !(await db.organizationMembership.count({
          where: {
            organizationId: organization.id,
            id: dto.membershipId,
            status: 'ACTIVE',
          },
        }))
      )
        throw new BadRequestException(
          'Recipient must be an active workspace member',
        );
      if (remove)
        await db.resourceAccess.deleteMany({
          where: {
            organizationId: organization.id,
            resourceId: id,
            membershipId: dto.membershipId,
            permission: dto.permission,
          },
        });
      else
        await db.resourceAccess.upsert({
          where: {
            resourceId_membershipId_permission: {
              resourceId: id,
              membershipId: dto.membershipId,
              permission: dto.permission,
            },
          },
          create: {
            organizationId: organization.id,
            resourceId: id,
            membershipId: dto.membershipId,
            permission: dto.permission,
            grantedById: member.id,
          },
          update: { grantedById: member.id },
        });
      await db.resource.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await this.event(
        db,
        resource,
        member,
        remove ? 'RESOURCE_ACCESS_REVOKED' : 'RESOURCE_ACCESS_GRANTED',
      );
      return { success: true };
    });
  }
  async ensureUpload(slug: string, id: string, userId: string) {
    const { resource, member } = await this.find(slug, id, userId);
    if (!(await this.rights(this.db, member, resource)).edit)
      throw new ForbiddenException('File upload requires Edit access');
    if (
      resource.source !== 'UPLOAD' ||
      resource.status !== 'ACTIVE' ||
      !['PENDING', 'FAILED'].includes(resource.uploadState)
    )
      throw new ConflictException('This resource is not awaiting an upload');
  }
  async upload(slug: string, id: string, userId: string, file: UploadFile) {
    const meta = await validateUpload(file, this.storage.config.maxBytes);
    const key = 'organizations/' + randomUUID() + '/' + randomUUID();
    await this.db.$transaction(async (db) => {
      const { organization } = await this.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const { resource, member } = await this.find(slug, id, userId, db);
      if (!(await this.rights(db, member, resource)).edit)
        throw new ForbiddenException('File upload requires Edit access');
      if (
        resource.source !== 'UPLOAD' ||
        resource.status !== 'ACTIVE' ||
        !['PENDING', 'FAILED'].includes(resource.uploadState)
      )
        throw new ConflictException('This resource is not awaiting an upload');
      const tenantKey =
        'organizations/' + organization.id + '/' + key.split('/').at(-1);
      await db.resource.update({
        where: { id },
        data: {
          objectKey: tenantKey,
          uploadState: 'UPLOADING',
          fileName: meta.fileName,
          mimeType: meta.mimeType,
          fileSize: meta.size,
          type: meta.type,
        },
      });
      await this.cleanup.enqueue(db, tenantKey, 600000);
    });
    const claim = await this.db.resource.findUniqueOrThrow({ where: { id } });
    const objectKey = claim.objectKey!;
    try {
      await this.storage.put(
        objectKey,
        file.buffer,
        meta.mimeType,
        meta.fileName,
      );
      await this.db.$transaction(async (db) => {
        const { organization } = await this.context(slug, userId, db);
        await this.permissions.lockWorkspace(db, organization.id);
        const { resource, member } = await this.find(slug, id, userId, db);
        if (
          resource.objectKey !== objectKey ||
          resource.uploadState !== 'UPLOADING' ||
          !(await this.rights(db, member, resource)).edit
        )
          throw new ForbiddenException('Upload authorization changed');
        const cleanup = await db.storageDeletion.findUniqueOrThrow({
          where: { key: objectKey },
        });
        if (cleanup.status !== 'PENDING')
          throw new ConflictException('Upload expired; retry');
        await db.resource.update({
          where: { id },
          data: { uploadState: 'READY' },
        });
        await db.storageDeletion.delete({ where: { key: objectKey } });
        await this.event(db, resource, member, 'RESOURCE_FILE_UPLOADED');
      });
    } catch (error) {
      await this.db.$transaction(async (db) => {
        await db.resource.updateMany({
          where: { id, objectKey, uploadState: 'UPLOADING' },
          data: { uploadState: 'FAILED', objectKey: null },
        });
        await this.cleanup.enqueue(db, objectKey);
      });
      throw error;
    }
    return this.detail(slug, id, userId);
  }
  async download(slug: string, id: string, userId: string) {
    return this.db.$transaction(
      async (db) => {
        const { organization } = await this.context(slug, userId, db);
        await this.permissions.lockWorkspace(db, organization.id);
        const { resource, member } = await this.find(slug, id, userId, db);
        if (
          resource.source !== 'UPLOAD' ||
          resource.uploadState !== 'READY' ||
          !resource.objectKey
        )
          throw new ConflictException('File is not ready for download');
        if (!(await this.storage.exists(resource.objectKey)))
          throw new ServiceUnavailableException(
            'Private file is unavailable; contact a workspace administrator',
          );
        const url = await this.storage.download(
          resource.objectKey,
          resource.fileName ?? 'download',
        );
        await this.event(db, resource, member, 'RESOURCE_DOWNLOAD_AUTHORIZED');
        return {
          url,
          expiresIn: this.storage.config.STORAGE_SIGNED_URL_TTL_SECONDS,
        };
      },
      { timeout: 20000 },
    );
  }
  async remove(slug: string, id: string, userId: string) {
    await this.db.$transaction(async (db) => {
      const { organization } = await this.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const { resource, member } = await this.find(slug, id, userId, db);
      this.permissions.requireManager(member.role);
      await db.reviewRequest.updateMany({
        where: { resourceId: id, status: 'PENDING' },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      if (resource.uploadState === 'UPLOADING')
        throw new ConflictException('Wait for the upload to finish');
      await db.resource.update({
        where: { id },
        data: {
          status: 'DELETED',
          uploadState: resource.objectKey ? 'DELETING' : resource.uploadState,
        },
      });
      if (resource.objectKey)
        await this.cleanup.enqueue(db, resource.objectKey);
      await this.event(db, resource, member, 'RESOURCE_DELETED');
    });
    await this.cleanup.drain();
    return { success: true };
  }
}
