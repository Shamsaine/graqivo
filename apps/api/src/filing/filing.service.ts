import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrganizationMembership } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import type {
  CreateFilingCategoryDto,
  FileResourceDto,
  FilingQuery,
} from './filing.dto.js';

@Injectable()
export class FilingService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(ResourcesService) private readonly resources: ResourcesService,
  ) {}

  private async context(
    slug: string,
    userId: string,
    db: Prisma.TransactionClient | PrismaService = this.db,
  ) {
    return this.projects.access(slug, userId, db as Prisma.TransactionClient);
  }

  private requireManager(member: OrganizationMembership) {
    if (member.role === 'MEMBER')
      throw new ForbiddenException(
        'Filing management requires an administrator',
      );
  }

  async categories(slug: string, userId: string) {
    const { organization } = await this.context(slug, userId);
    return this.db.filingCategory.findMany({
      where: { organizationId: organization.id, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        code: true,
        description: true,
        sortOrder: true,
      },
    });
  }

  async createCategory(
    slug: string,
    userId: string,
    dto: CreateFilingCategoryDto,
  ) {
    return this.db.$transaction(async (db) => {
      const { organization, member } = await this.context(slug, userId, db);
      this.requireManager(member);
      if (dto.parentId) {
        const parent = await db.filingCategory.findFirst({
          where: {
            organizationId: organization.id,
            id: dto.parentId,
            archivedAt: null,
          },
        });
        if (!parent)
          throw new BadRequestException('Parent category unavailable');
      }
      return db.filingCategory.create({
        data: {
          id: randomUUID(),
          organizationId: organization.id,
          parentId: dto.parentId ?? null,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          description: dto.description?.trim() || null,
          createdById: member.id,
        },
      });
    });
  }

  async updateCategory(
    slug: string,
    id: string,
    userId: string,
    dto: CreateFilingCategoryDto,
  ) {
    return this.db.$transaction(async (db) => {
      const { organization, member } = await this.context(slug, userId, db);
      this.requireManager(member);
      const category = await db.filingCategory.findFirst({
        where: { organizationId: organization.id, id, archivedAt: null },
      });
      if (!category) throw new NotFoundException('Filing category unavailable');
      if (dto.parentId === id)
        throw new BadRequestException('A category cannot contain itself');
      return db.filingCategory.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          description: dto.description?.trim() || null,
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        },
      });
    });
  }

  async list(slug: string, userId: string, query: FilingQuery) {
    const { organization, member } = await this.context(slug, userId);
    const and: Prisma.ResourceWhereInput[] = [
      this.permissions.resourceScope(organization.id, member),
    ];
    if (query.filed === 'true') and.push({ filing: { isNot: null } });
    if (query.filed === 'false') and.push({ filing: null });
    if (query.categoryId)
      and.push({
        filing: { is: { filingCategoryId: query.categoryId } },
      });
    if (query.confidentialityLevel)
      and.push({
        filing: { is: { confidentialityLevel: query.confidentialityLevel } },
      });
    if (query.filed === 'false') and.push({ filing: null });
    if (query.search) {
      const term = query.search.trim();
      and.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { subject: { contains: term, mode: 'insensitive' } },
          { purpose: { contains: term, mode: 'insensitive' } },
          { keywords: { has: term.toLowerCase() } },
          {
            filing: {
              is: {
                referenceNumber: { contains: term, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }
    const where = { AND: and };
    const [total, items] = await this.db.$transaction([
      this.db.resource.count({ where }),
      this.db.resource.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          filing: {
            include: {
              filingCategory: {
                select: { id: true, name: true, code: true, parentId: true },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      total,
      page: query.page,
      limit: query.limit,
      items: await Promise.all(
        items.map((item) => this.resources.safe(item, member)),
      ),
    };
  }

  private async reference(
    db: Prisma.TransactionClient,
    organizationId: string,
    category: { code: string; parentId: string | null },
    year: number,
  ) {
    const scopeKey = category.parentId
      ? `${category.parentId}:${category.code}`
      : category.code;
    const sequence = await db.filingReferenceSequence.upsert({
      where: {
        organizationId_scopeKey_year: { organizationId, scopeKey, year },
      },
      create: {
        organizationId,
        scopeKey,
        prefix: category.code,
        year,
        nextValue: 2,
      },
      update: { nextValue: { increment: 1 } },
    });
    const value = sequence.nextValue - 1;
    return `${category.code}/${year}/${String(value).padStart(4, '0')}`;
  }

  async file(slug: string, id: string, userId: string, dto: FileResourceDto) {
    return this.db.$transaction(async (db) => {
      const { organization, member } = await this.context(slug, userId, db);
      const found = await this.resources.find(slug, id, userId, db);
      const rights = await this.resources.rights(db, member, found.resource);
      if (!rights.edit)
        throw new ForbiddenException('Filing requires Edit access');
      const category = await db.filingCategory.findFirst({
        where: {
          organizationId: organization.id,
          id: dto.filingCategoryId,
          archivedAt: null,
        },
      });
      if (!category)
        throw new BadRequestException('Choose an active filing category');
      const recordDate = dto.recordDate ? new Date(dto.recordDate) : new Date();
      const referenceNumber = await this.reference(
        db,
        organization.id,
        category,
        recordDate.getUTCFullYear(),
      );
      const filing = await db.resourceFiling.upsert({
        where: {
          organizationId_resourceId: {
            organizationId: organization.id,
            resourceId: id,
          },
        },
        create: {
          organizationId: organization.id,
          resourceId: id,
          filingCategoryId: category.id,
          referenceNumber,
          recordDate,
          confidentialityLevel: dto.confidentialityLevel ?? 'INTERNAL',
          filedById: member.id,
        },
        update: {
          filingCategoryId: category.id,
          recordDate,
          confidentialityLevel: dto.confidentialityLevel ?? 'INTERNAL',
        },
      });
      await db.resourceEvent.create({
        data: {
          organizationId: organization.id,
          resourceId: id,
          actorMembershipId: member.id,
          action: 'RESOURCE_FILED',
        },
      });
      return filing;
    });
  }

  async unfile(slug: string, id: string, userId: string) {
    return this.db.$transaction(async (db) => {
      const { organization, member } = await this.context(slug, userId, db);
      const found = await this.resources.find(slug, id, userId, db);
      const rights = await this.resources.rights(db, member, found.resource);
      if (!rights.edit)
        throw new ForbiddenException('Filing requires Edit access');
      await db.resourceFiling.deleteMany({
        where: { organizationId: organization.id, resourceId: id },
      });
      await db.resourceEvent.create({
        data: {
          organizationId: organization.id,
          resourceId: id,
          actorMembershipId: member.id,
          action: 'RESOURCE_UNFILED',
        },
      });
      return { success: true };
    });
  }
}
