CREATE TYPE "WorkspaceType" AS ENUM ('ORGANIZATION', 'PERSONAL');
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "workspaceType" "WorkspaceType" NOT NULL DEFAULT 'ORGANIZATION',
  "theme" TEXT NOT NULL DEFAULT 'indigo',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
