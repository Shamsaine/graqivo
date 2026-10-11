import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Resource, OrganizationMembership } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type {
  RequestReviewDto,
  SubmitReviewDto,
  ReviewQuery,
} from './reviews.dto.js';
const person = {
  id: true,
  user: { select: { id: true, name: true } },
} as const;
const requestsInclude = {
  requester: { select: person },
  reviewer: { select: person },
  reviews: {
    select: {
      id: true,
      type: true,
      comment: true,
      createdAt: true,
      author: { select: person },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 50,
  },
} as const;
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ResourcesService) private readonly resources: ResourcesService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
  ) {}
  writable(resource: Resource) {
    if (resource.status !== 'ACTIVE')
      throw new ConflictException('Restore the resource before reviewing');
    if (resource.source === 'UPLOAD' && resource.uploadState !== 'READY')
      throw new ConflictException('Upload the file before reviewing');
  }
  async reviewers(slug: string, id: string, userId: string) {
    const { resource, member, organization } = await this.resources.find(
      slug,
      id,
      userId,
    );
    if (!(await this.resources.rights(this.db, member, resource)).edit)
      throw new ForbiddenException('Requesting review requires Edit access');
    const members = await this.db.organizationMembership.findMany({
      where: { organizationId: organization.id, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    const eligible = [];
    for (const candidate of members)
      if (await this.canReview(this.db, candidate, resource))
        eligible.push({ id: candidate.id, user: candidate.user });
    return eligible;
  }
  async history(slug: string, id: string, userId: string) {
    const { organization } = await this.resources.find(slug, id, userId);
    const [requests, comments] = await Promise.all([
      this.db.reviewRequest.findMany({
        where: { organizationId: organization.id, resourceId: id },
        include: requestsInclude,
        orderBy: [{ round: 'desc' }],
        take: 50,
      }),
      this.db.review.findMany({
        where: {
          organizationId: organization.id,
          resourceId: id,
          requestId: null,
        },
        select: {
          id: true,
          type: true,
          comment: true,
          createdAt: true,
          author: { select: person },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    ]);
    return { requests, comments };
  }
  async request(
    slug: string,
    id: string,
    userId: string,
    dto: RequestReviewDto,
  ) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.resources.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const { resource, member } = await this.resources.find(
        slug,
        id,
        userId,
        db,
      );
      this.writable(resource);
      if (!(await this.resources.rights(db, member, resource)).edit)
        throw new ForbiddenException('Requesting review requires Edit access');
      if (
        await db.reviewRequest.count({
          where: { resourceId: id, status: 'PENDING' },
        })
      )
        throw new ConflictException(
          'This resource already has a pending review',
        );
      const reviewer = await db.organizationMembership.findFirst({
        where: {
          organizationId: organization.id,
          id: dto.reviewerMembershipId,
          status: 'ACTIVE',
        },
      });
      if (!reviewer || !(await this.canReview(db, reviewer, resource)))
        throw new BadRequestException(
          'Choose an active member with Review access',
        );
      const request = await db.reviewRequest.create({
        data: {
          organizationId: organization.id,
          resourceId: id,
          requesterMembershipId: member.id,
          reviewerMembershipId: reviewer.id,
          round: resource.reviewRound + 1,
          comment: dto.comment?.trim() || null,
        },
      });
      await db.resource.update({
        where: { id },
        data: { reviewState: 'PENDING', reviewRound: { increment: 1 } },
      });
      await this.resources.event(db, resource, member, 'REVIEW_REQUESTED');
      return request;
    });
  }
  async canReview(
    db: Prisma.TransactionClient,
    member: OrganizationMembership,
    resource: Resource,
  ) {
    return (
      !!(await db.resource.count({
        where: {
          ...this.permissions.resourceScope(resource.organizationId, member),
          id: resource.id,
        },
      })) && (await this.resources.rights(db, member, resource)).review
    );
  }
  async submit(slug: string, id: string, userId: string, dto: SubmitReviewDto) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.resources.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const { resource, member } = await this.resources.find(
        slug,
        id,
        userId,
        db,
      );
      this.writable(resource);
      if (!(await this.resources.rights(db, member, resource)).review)
        throw new ForbiddenException('Review access required');
      const comment = dto.comment?.trim() || null;
      if (dto.type !== 'APPROVAL' && !comment)
        throw new BadRequestException('Add a review comment');
      const pending = dto.requestId
        ? await db.reviewRequest.findFirst({
            where: {
              id: dto.requestId,
              organizationId: organization.id,
              resourceId: id,
              status: 'PENDING',
            },
          })
        : null;
      if (dto.requestId && !pending)
        throw new ConflictException('Review request is no longer pending');
      if (dto.type !== 'COMMENT') {
        if (!pending)
          throw new BadRequestException('Choose the pending review request');
        if (
          pending.reviewerMembershipId !== member.id &&
          member.role === 'MEMBER'
        )
          throw new ForbiddenException(
            'Only the assigned reviewer or an administrator can decide',
          );
      }
      const review = await db.review.create({
        data: {
          organizationId: organization.id,
          resourceId: id,
          requestId: pending?.id,
          authorMembershipId: member.id,
          type: dto.type,
          comment,
        },
      });
      if (dto.type !== 'COMMENT') {
        await db.reviewRequest.update({
          where: { id: pending!.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await db.resource.update({
          where: { id },
          data: {
            reviewState:
              dto.type === 'APPROVAL' ? 'APPROVED' : 'CHANGES_REQUESTED',
          },
        });
      }
      if (dto.type === 'COMMENT')
        await db.resource.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      await this.resources.event(
        db,
        resource,
        member,
        dto.type === 'COMMENT'
          ? 'REVIEW_COMMENTED'
          : dto.type === 'APPROVAL'
            ? 'REVIEW_APPROVED'
            : 'REVIEW_CHANGES_REQUESTED',
      );
      return review;
    });
  }
  async cancel(slug: string, id: string, requestId: string, userId: string) {
    return this.db.$transaction(async (db) => {
      const { organization } = await this.resources.context(slug, userId, db);
      await this.permissions.lockWorkspace(db, organization.id);
      const { resource, member } = await this.resources.find(
        slug,
        id,
        userId,
        db,
      );
      if (!(await this.resources.rights(db, member, resource)).edit)
        throw new ForbiddenException('Cancelling review requires Edit access');
      const result = await db.reviewRequest.updateMany({
        where: {
          id: requestId,
          organizationId: organization.id,
          resourceId: id,
          status: 'PENDING',
        },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      if (!result.count)
        throw new ConflictException('Review request is no longer pending');
      await db.resource.update({
        where: { id },
        data: { reviewState: 'NO_REVIEW' },
      });
      await this.resources.event(db, resource, member, 'REVIEW_CANCELLED');
      return { success: true };
    });
  }
  async list(slug: string, userId: string, query: ReviewQuery) {
    return this.db.$transaction(
      async (db) => {
        const { organization, member } = await this.resources.context(
          slug,
          userId,
          db,
        );
        if (
          query.projectId &&
          !(await db.project.count({
            where: {
              ...this.permissions.projectScope(organization.id, member),
              id: query.projectId,
            },
          }))
        )
          throw new NotFoundException('Project unavailable');
        const where: Prisma.ReviewRequestWhereInput = {
          organizationId: organization.id,
          resource: {
            AND: [
              this.permissions.resourceScope(organization.id, member),
              ...(query.projectId ? [{ projectId: query.projectId }] : []),
            ],
          },
          ...(query.status ? { status: query.status } : {}),
          ...(query.mine === 'true' ? { reviewerMembershipId: member.id } : {}),
        };
        const total = await db.reviewRequest.count({ where });
        const items = await db.reviewRequest.findMany({
          where,
          include: {
            ...requestsInclude,
            resource: {
              select: {
                id: true,
                title: true,
                status: true,
                reviewState: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        });
        return { total, page: query.page, limit: query.limit, items };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
