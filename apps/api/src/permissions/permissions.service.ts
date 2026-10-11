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
