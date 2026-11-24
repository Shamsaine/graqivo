import { Prisma } from '@prisma/client';
const workspaceActions = new Set([
  'WORKSPACE_CREATED',
  'WORKSPACE_SETTINGS_UPDATED',
]);
const adminActions = new Set([
  'MEMBER_INVITED',
  'INVITATION_ACCEPTED',
  'INVITATION_REVOKED',
  'MEMBERSHIP_ROLE_CHANGED',
  'MEMBERSHIP_REVOKED',
]);
/** Store a deliberately minimal user-facing projection alongside the security audit. */
export async function recordAudit(
  db: Prisma.TransactionClient,
  args: Prisma.AuditEventCreateArgs,
) {
  const audit = await db.auditEvent.create(args);
  if (!audit.organizationId) return audit;
  let projectId: string | null = null,
    resourceId: string | null = null;
  let visibility: 'WORKSPACE' | 'ADMIN' | 'PROJECT' | 'RESOURCE';
  if (workspaceActions.has(audit.action)) visibility = 'WORKSPACE';
  else if (adminActions.has(audit.action)) visibility = 'ADMIN';
  else if (audit.action.startsWith('PROJECT_')) {
    const project = await db.project.findFirst({
      where: { organizationId: audit.organizationId, id: audit.targetId ?? '' },
    });
    if (!project) return audit;
    projectId = project.id;
    visibility = 'PROJECT';
  } else if (
    audit.action.startsWith('RESOURCE_') ||
    audit.action.startsWith('REVIEW_')
  ) {
    const resource = await db.resource.findFirst({
      where: { organizationId: audit.organizationId, id: audit.targetId ?? '' },
    });
    if (!resource) return audit;
    resourceId = resource.id;
    projectId = resource.projectId;
    visibility = 'RESOURCE';
  } else return audit;
  const actor = audit.actorId
    ? await db.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: audit.organizationId,
            userId: audit.actorId,
          },
        },
      })
    : null;
  await db.activity.create({
    data: {
      organizationId: audit.organizationId,
      actorMembershipId: actor?.id,
      projectId,
      resourceId,
      visibility,
      action: audit.action,
      createdAt: audit.createdAt,
    },
  });
  return audit;
}
