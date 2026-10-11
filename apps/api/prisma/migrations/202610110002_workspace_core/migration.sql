-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('CONTRIBUTOR', 'VIEWER');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "logoUrl" TEXT;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "leadMembershipId" TEXT,
    "createdById" TEXT NOT NULL,
    "startDate" DATE,
    "targetDate" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_organizationId_status_updatedAt_idx" ON "Project"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_id_key" ON "Project"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ProjectMembership_organizationId_membershipId_idx" ON "ProjectMembership"("organizationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMembership_projectId_membershipId_key" ON "ProjectMembership"("projectId", "membershipId");

-- CreateIndex
CREATE INDEX "ProjectEvent_organizationId_projectId_createdAt_idx" ON "ProjectEvent"("organizationId", "projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_leadMembershipId_fkey" FOREIGN KEY ("organizationId", "leadMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_organizationId_actorMembershipId_fkey" FOREIGN KEY ("organizationId", "actorMembershipId") REFERENCES "OrganizationMembership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
