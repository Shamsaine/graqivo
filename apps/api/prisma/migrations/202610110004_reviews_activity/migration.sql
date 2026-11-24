-- CreateEnum
CREATE TYPE "ReviewRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('COMMENT', 'APPROVAL', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ActivityVisibility" AS ENUM ('WORKSPACE', 'ADMIN', 'PROJECT', 'RESOURCE');

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "reviewRound" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requesterMembershipId" TEXT NOT NULL,
    "reviewerMembershipId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requestId" TEXT,
    "authorMembershipId" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "projectId" TEXT,
    "resourceId" TEXT,
    "visibility" "ActivityVisibility" NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewRequest_organizationId_status_reviewerMembershipId_cr_idx" ON "ReviewRequest"("organizationId", "status", "reviewerMembershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_organizationId_id_key" ON "ReviewRequest"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_resourceId_round_key" ON "ReviewRequest"("resourceId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_organizationId_resourceId_id_key" ON "ReviewRequest"("organizationId", "resourceId", "id");

-- CreateIndex
CREATE INDEX "Review_organizationId_resourceId_createdAt_idx" ON "Review"("organizationId", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_organizationId_createdAt_id_idx" ON "Activity"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Activity_organizationId_projectId_createdAt_idx" ON "Activity"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_organizationId_resourceId_createdAt_idx" ON "Activity"("organizationId", "resourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_organizationId_resourceId_fkey" FOREIGN KEY ("organizationId", "resourceId") REFERENCES "Resource"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_organizationId_requesterMembershipId_fkey" FOREIGN KEY ("organizationId", "requesterMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_organizationId_reviewerMembershipId_fkey" FOREIGN KEY ("organizationId", "reviewerMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_organizationId_resourceId_fkey" FOREIGN KEY ("organizationId", "resourceId") REFERENCES "Resource"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_organizationId_resourceId_requestId_fkey" FOREIGN KEY ("organizationId", "resourceId", "requestId") REFERENCES "ReviewRequest"("organizationId", "resourceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_organizationId_authorMembershipId_fkey" FOREIGN KEY ("organizationId", "authorMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_actorMembershipId_fkey" FOREIGN KEY ("organizationId", "actorMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_resourceId_fkey" FOREIGN KEY ("organizationId", "resourceId") REFERENCES "Resource"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only one pending round and one decision per round, even for direct database writes.
CREATE UNIQUE INDEX "ReviewRequest_one_pending_resource" ON "ReviewRequest" ("resourceId") WHERE "status"='PENDING';
CREATE UNIQUE INDEX "Review_one_decision_request" ON "Review" ("requestId") WHERE "type"<>'COMMENT';
ALTER TABLE "Review" ADD CONSTRAINT "Review_decision_requires_request" CHECK ("type"='COMMENT' OR "requestId" IS NOT NULL);
ALTER TABLE "Review" ADD CONSTRAINT "Review_comment_required" CHECK ("type"='APPROVAL' OR length(trim(coalesce("comment",'')))>0);
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_round_positive" CHECK ("round">0);
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_status_timestamp" CHECK (("status"='PENDING' AND "completedAt" IS NULL) OR ("status"<>'PENDING' AND "completedAt" IS NOT NULL));
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_target_visibility" CHECK (
 ("visibility" IN ('WORKSPACE','ADMIN') AND "projectId" IS NULL AND "resourceId" IS NULL)
 OR ("visibility"='PROJECT' AND "projectId" IS NOT NULL AND "resourceId" IS NULL)
 OR ("visibility"='RESOURCE' AND "resourceId" IS NOT NULL)
);

-- Historical user-facing projection: deliberately omit all audit metadata.
INSERT INTO "Activity" ("id","organizationId","actorMembershipId","projectId","resourceId","visibility","action","createdAt")
SELECT 'history-'||a."id",a."organizationId",m."id",
 CASE WHEN r."id" IS NOT NULL THEN r."projectId" ELSE p."id" END,r."id",
 CASE WHEN r."id" IS NOT NULL THEN 'RESOURCE'::"ActivityVisibility"
 WHEN p."id" IS NOT NULL THEN 'PROJECT'::"ActivityVisibility"
 WHEN a."action" IN ('WORKSPACE_CREATED','WORKSPACE_SETTINGS_UPDATED') THEN 'WORKSPACE'::"ActivityVisibility"
 ELSE 'ADMIN'::"ActivityVisibility" END,
 a."action",a."createdAt"
FROM "AuditEvent" a
LEFT JOIN "OrganizationMembership" m ON m."organizationId"=a."organizationId" AND m."userId"=a."actorId"
LEFT JOIN "Project" p ON p."organizationId"=a."organizationId" AND p."id"=a."targetId" AND a."action" LIKE 'PROJECT_%'
LEFT JOIN "Resource" r ON r."organizationId"=a."organizationId" AND r."id"=a."targetId" AND a."action" LIKE 'RESOURCE_%'
WHERE a."organizationId" IS NOT NULL AND (
 p."id" IS NOT NULL OR r."id" IS NOT NULL OR
 a."action" IN ('WORKSPACE_CREATED','WORKSPACE_SETTINGS_UPDATED','MEMBER_INVITED','INVITATION_ACCEPTED','INVITATION_REVOKED','MEMBERSHIP_ROLE_CHANGED','MEMBERSHIP_REVOKED')
);
