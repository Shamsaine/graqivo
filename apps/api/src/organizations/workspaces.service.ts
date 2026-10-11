import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrganizationRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { CreateWorkspaceDto, InviteDto } from './workspaces.dto.js';
@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}
  async list(userId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
      select: {
        role: true,
        organization: {
          select: { id: true, name: true, slug: true, workspaceType: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  async create(userId: string, dto: CreateWorkspaceDto) {
    try {
      return await this.prisma.$transaction(async (db) => {
        const organization = await db.organization.create({
          data: { ...dto, name: dto.name.trim() },
        });
        if (!organization.name)
          throw new BadRequestException('Workspace name is required');
        await db.organizationMembership.create({
          data: { organizationId: organization.id, userId, role: 'OWNER' },
        });
        await db.auditEvent.create({
          data: {
            organizationId: organization.id,
            actorId: userId,
            action: 'WORKSPACE_CREATED',
            targetId: organization.id,
          },
        });
        return organization;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('This workspace address is already in use');
      throw error;
    }
  }
  async accessible(slug: string, userId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (!organization) throw new NotFoundException('Workspace unavailable');
    const membership = await this.permissions.membership(
      this.prisma,
      organization.id,
      userId,
    );
    return { organization, role: membership.role };
  }
  async members(slug: string, userId: string) {
    const { organization } = await this.accessible(slug, userId);
    return this.prisma.organizationMembership.findMany({
      where: { organizationId: organization.id, status: 'ACTIVE' },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true } },
        joinedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  async invitations(slug: string, userId: string) {
    const access = await this.accessible(slug, userId);
    this.permissions.requireManager(access.role);
    return this.prisma.invitation.findMany({
      where: { organizationId: access.organization.id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async invite(slug: string, userId: string, dto: InviteDto) {
    const { organization } = await this.accessible(slug, userId);
    const token = randomBytes(32).toString('hex');
    const emailAddress = dto.email.toLowerCase().trim();
    const invitation = await this.prisma.$transaction(async (db) => {
      await this.permissions.lockWorkspace(db, organization.id);
      const actor = await this.permissions.membership(
        db,
        organization.id,
        userId,
      );
      this.permissions.requireManager(actor.role);
      if (organization.workspaceType === 'PERSONAL')
        throw new BadRequestException(
          'Create an organization workspace to invite people',
        );
      const member = await db.organizationMembership.findFirst({
        where: {
          organizationId: organization.id,
          status: 'ACTIVE',
          user: { email: emailAddress },
        },
      });
      if (member)
        throw new ConflictException('This person is already a member');
      await db.invitation.updateMany({
        where: {
          organizationId: organization.id,
          email: emailAddress,
          status: 'PENDING',
        },
        data: { status: 'REVOKED' },
      });
      const created = await db.invitation.create({
        data: {
          organizationId: organization.id,
          invitedById: actor.id,
          email: emailAddress,
          role: dto.role,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 72 * 3600000),
        },
      });
      await db.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorId: userId,
          action: 'MEMBER_INVITED',
          targetId: created.id,
        },
      });
      // Enqueue in the same transaction through a dedicated queue method.
      const url = new URL('/invitations/accept', process.env.FRONTEND_URL);
      url.hash = 'token=' + token;
      await this.email.enqueue(db, {
        to: emailAddress,
        subject: 'Join ' + organization.name + ' on Graqivo',
        text:
          'Accept your workspace invitation: ' +
          url.toString() +
          '\nThis invitation expires in 72 hours.',
      });
      return {
        id: created.id,
        email: created.email,
        role: created.role,
        expiresAt: created.expiresAt,
        status: created.status,
      };
    });
    return invitation;
  }
  async accept(user: { id: string; email: string }, token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
    });
    if (!invitation)
      throw new BadRequestException('Invitation unavailable or expired');
    return this.prisma.$transaction(async (db) => {
      await this.permissions.lockWorkspace(db, invitation.organizationId);
      const current = await db.invitation.findUnique({
        where: { id: invitation.id },
        include: { organization: true, invitedBy: true },
      });
      if (
        !current ||
        current.status !== 'PENDING' ||
        current.expiresAt <= new Date() ||
        current.organization.status !== 'ACTIVE'
      )
        throw new BadRequestException('Invitation unavailable or expired');
      if (current.email !== user.email.toLowerCase())
        throw new ForbiddenException('Sign in with the invited email address');
      const inviter = await this.permissions.membership(
        db,
        current.organizationId,
        current.invitedBy.userId,
      );
      this.permissions.requireManager(inviter.role);
      const membership = await db.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: current.organizationId,
            userId: user.id,
          },
        },
      });
      if (membership?.status === 'ACTIVE')
        throw new ConflictException('Already a workspace member');
      await db.organizationMembership.upsert({
        where: {
          organizationId_userId: {
            organizationId: current.organizationId,
            userId: user.id,
          },
        },
        create: {
          organizationId: current.organizationId,
          userId: user.id,
          role: current.role,
        },
        update: { status: 'ACTIVE', role: current.role, joinedAt: new Date() },
      });
      await db.invitation.update({
        where: { id: current.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedById: user.id,
        },
      });
      await db.auditEvent.create({
        data: {
          organizationId: current.organizationId,
          actorId: user.id,
          action: 'INVITATION_ACCEPTED',
          targetId: current.id,
        },
      });
      return { slug: current.organization.slug };
    });
  }
  async revokeInvitation(slug: string, userId: string, invitationId: string) {
    const { organization } = await this.accessible(slug, userId);
    await this.prisma.$transaction(async (db) => {
      await this.permissions.lockWorkspace(db, organization.id);
      const actor = await this.permissions.membership(
        db,
        organization.id,
        userId,
      );
      this.permissions.requireManager(actor.role);
      const changed = await db.invitation.updateMany({
        where: {
          id: invitationId,
          organizationId: organization.id,
          status: 'PENDING',
        },
        data: { status: 'REVOKED' },
      });
      if (!changed.count)
        throw new NotFoundException('Pending invitation unavailable');
      await db.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorId: userId,
          action: 'INVITATION_REVOKED',
          targetId: invitationId,
        },
      });
    });
    return { success: true };
  }
  async changeMember(
    slug: string,
    actorId: string,
    membershipId: string,
    role?: OrganizationRole,
  ) {
    const { organization } = await this.accessible(slug, actorId);
    return this.prisma.$transaction(async (db) => {
      await this.permissions.lockWorkspace(db, organization.id);
      const actor = await this.permissions.membership(
        db,
        organization.id,
        actorId,
      );
      this.permissions.requireManager(actor.role);
      const target = await db.organizationMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: organization.id,
          status: 'ACTIVE',
        },
      });
      if (!target) throw new NotFoundException('Member unavailable');
      if (
        (target.role === 'OWNER' || role === 'OWNER') &&
        actor.role !== 'OWNER'
      )
        throw new ForbiddenException('Only Owners can change ownership');
      if (target.role === 'OWNER' && role !== 'OWNER') {
        const owners = await db.organizationMembership.count({
          where: {
            organizationId: organization.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });
        if (owners <= 1)
          throw new ConflictException(
            'A workspace must retain at least one Owner',
          );
      }
      await db.organizationMembership.update({
        where: { id: target.id },
        data: role ? { role } : { status: 'REVOKED' },
      });
      await db.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorId,
          action: role ? 'MEMBERSHIP_ROLE_CHANGED' : 'MEMBERSHIP_REVOKED',
          targetId: target.id,
          metadata: role ? { role } : {},
        },
      });
      return { success: true };
    });
  }
}
