ALTER TABLE "Resource"
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "documentDate" DATE,
  ADD COLUMN "descriptionUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "metadataCompleteness" INTEGER NOT NULL DEFAULT 20;

CREATE INDEX "Resource_organizationId_documentDate_idx"
  ON "Resource"("organizationId", "documentDate");
CREATE INDEX "Resource_keywords_gin_idx"
  ON "Resource" USING GIN ("keywords");

CREATE TABLE "FilingCategory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "FilingCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FilingCategory_organizationId_id_key"
  ON "FilingCategory"("organizationId", "id");
CREATE UNIQUE INDEX "FilingCategory_organizationId_parentId_code_key"
  ON "FilingCategory"("organizationId", "parentId", "code");
CREATE INDEX "FilingCategory_organizationId_parentId_sortOrder_idx"
  ON "FilingCategory"("organizationId", "parentId", "sortOrder");
ALTER TABLE "FilingCategory"
  ADD CONSTRAINT "FilingCategory_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FilingCategory"
  ADD CONSTRAINT "FilingCategory_organizationId_parentId_fkey"
  FOREIGN KEY ("organizationId", "parentId")
  REFERENCES "FilingCategory"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FilingCategory"
  ADD CONSTRAINT "FilingCategory_organizationId_createdById_fkey"
  FOREIGN KEY ("organizationId", "createdById")
  REFERENCES "OrganizationMembership"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ResourceFiling" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "filingCategoryId" TEXT NOT NULL,
  "referenceNumber" TEXT NOT NULL,
  "recordDate" DATE NOT NULL,
  "confidentialityLevel" TEXT NOT NULL DEFAULT 'INTERNAL',
  "filedById" TEXT NOT NULL,
  "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceFiling_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResourceFiling_organizationId_resourceId_key"
  ON "ResourceFiling"("organizationId", "resourceId");
CREATE UNIQUE INDEX "ResourceFiling_organizationId_referenceNumber_key"
  ON "ResourceFiling"("organizationId", "referenceNumber");
CREATE UNIQUE INDEX "ResourceFiling_organizationId_id_key"
  ON "ResourceFiling"("organizationId", "id");
CREATE INDEX "ResourceFiling_organizationId_filingCategoryId_recordDate_idx"
  ON "ResourceFiling"("organizationId", "filingCategoryId", "recordDate");
ALTER TABLE "ResourceFiling"
  ADD CONSTRAINT "ResourceFiling_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceFiling"
  ADD CONSTRAINT "ResourceFiling_organizationId_resourceId_fkey"
  FOREIGN KEY ("organizationId", "resourceId")
  REFERENCES "Resource"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceFiling"
  ADD CONSTRAINT "ResourceFiling_organizationId_filingCategoryId_fkey"
  FOREIGN KEY ("organizationId", "filingCategoryId")
  REFERENCES "FilingCategory"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceFiling"
  ADD CONSTRAINT "ResourceFiling_organizationId_filedById_fkey"
  FOREIGN KEY ("organizationId", "filedById")
  REFERENCES "OrganizationMembership"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FilingReferenceSequence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FilingReferenceSequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FilingReferenceSequence_organizationId_scopeKey_year_key"
  ON "FilingReferenceSequence"("organizationId", "scopeKey", "year");
ALTER TABLE "FilingReferenceSequence"
  ADD CONSTRAINT "FilingReferenceSequence_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ResourceMetadataHistory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "changedById" TEXT NOT NULL,
  "previousValues" JSONB NOT NULL,
  "newValues" JSONB NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceMetadataHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceMetadataHistory_organizationId_resourceId_changedAt_idx"
  ON "ResourceMetadataHistory"("organizationId", "resourceId", "changedAt");
ALTER TABLE "ResourceMetadataHistory"
  ADD CONSTRAINT "ResourceMetadataHistory_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceMetadataHistory"
  ADD CONSTRAINT "ResourceMetadataHistory_organizationId_resourceId_fkey"
  FOREIGN KEY ("organizationId", "resourceId")
  REFERENCES "Resource"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceMetadataHistory"
  ADD CONSTRAINT "ResourceMetadataHistory_organizationId_changedById_fkey"
  FOREIGN KEY ("organizationId", "changedById")
  REFERENCES "OrganizationMembership"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
