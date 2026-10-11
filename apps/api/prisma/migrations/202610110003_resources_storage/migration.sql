-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('DOCUMENT', 'SHEET', 'PRESENTATION', 'PDF', 'LINK', 'OTHER');

-- CreateEnum
CREATE TYPE "ResourceSource" AS ENUM ('EXTERNAL', 'UPLOAD');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('NO_REVIEW', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "UploadState" AS ENUM ('NONE', 'PENDING', 'UPLOADING', 'READY', 'FAILED', 'DELETING', 'DELETED');

-- CreateEnum
CREATE TYPE "ResourcePermission" AS ENUM ('VIEW', 'EDIT', 'REVIEW');

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ResourceType" NOT NULL,
    "source" "ResourceSource" NOT NULL,
    "externalUrl" TEXT,
    "objectKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "uploadState" "UploadState" NOT NULL DEFAULT 'NONE',
    "ownerMembershipId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "reviewState" "ReviewState" NOT NULL DEFAULT 'NO_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permission" "ResourcePermission" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageDeletion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Resource_objectKey_key" ON "Resource"("objectKey");

-- CreateIndex
CREATE INDEX "Resource_organizationId_status_updatedAt_id_idx" ON "Resource"("organizationId", "status", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Resource_organizationId_projectId_idx" ON "Resource"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_organizationId_id_key" ON "Resource"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ResourceAccess_organizationId_membershipId_idx" ON "ResourceAccess"("organizationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceAccess_resourceId_membershipId_permission_key" ON "ResourceAccess"("resourceId", "membershipId", "permission");

-- CreateIndex
CREATE INDEX "ResourceEvent_organizationId_resourceId_createdAt_idx" ON "ResourceEvent"("organizationId", "resourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageDeletion_key_key" ON "StorageDeletion"("key");

-- CreateIndex
CREATE INDEX "StorageDeletion_status_availableAt_idx" ON "StorageDeletion"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_organizationId_ownerMembershipId_fkey" FOREIGN KEY ("organizationId", "ownerMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAccess" ADD CONSTRAINT "ResourceAccess_organizationId_resourceId_fkey" FOREIGN KEY ("organizationId", "resourceId") REFERENCES "Resource"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAccess" ADD CONSTRAINT "ResourceAccess_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAccess" ADD CONSTRAINT "ResourceAccess_organizationId_grantedById_fkey" FOREIGN KEY ("organizationId", "grantedById") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceEvent" ADD CONSTRAINT "ResourceEvent_organizationId_resourceId_fkey" FOREIGN KEY ("organizationId", "resourceId") REFERENCES "Resource"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceEvent" ADD CONSTRAINT "ResourceEvent_organizationId_actorMembershipId_fkey" FOREIGN KEY ("organizationId", "actorMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
