import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipStatus, OrganizationRole, Prisma } from '@prisma/client';
@Injectable()
export class PermissionsService {
  async membership(
    db: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ) {
    const membership = await db.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { organization: true },
    });
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.organization.status !== 'ACTIVE'
    )
      throw new ForbiddenException('Workspace access denied');
    return membership;
  }
  projectScope(
    organizationId: string,
    member: { id: string; role: string },
  ): Prisma.ProjectWhereInput {
    return {
      organizationId,
      ...(member.role === 'MEMBER'
        ? {
            memberships: {
              some: {
                membershipId: member.id,
                membership: { status: 'ACTIVE' },
              },
            },
          }
        : {}),
    };
  }
  resourceScope(
    organizationId: string,
    member: { id: string; role: string },
  ): Prisma.ResourceWhereInput {
    return {
      organizationId,
      status: { not: 'DELETED' },
      ...(member.role === 'MEMBER'
        ? {
            OR: [
              { ownerMembershipId: member.id },
              { createdById: member.id },
              {
                access: {
                  some: {
                    membershipId: member.id,
                    membership: { status: 'ACTIVE' },
                  },
                },
              },
              {
                project: {
                  memberships: {
                    some: {
                      membershipId: member.id,
                      membership: { status: 'ACTIVE' },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }
  requireManager(role: OrganizationRole) {
    if (role === OrganizationRole.MEMBER)
      throw new ForbiddenException(
        'Workspace administration requires Owner or Admin',
      );
  }
  async lockWorkspace(db: Prisma.TransactionClient, organizationId: string) {
    await db.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
  }
}
