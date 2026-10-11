import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, it } from 'vitest';

it('persists workspace defaults and rejects a duplicate slug', async () => {
  const prisma = new PrismaClient();
  const slug = `foundation-${randomUUID()}`;
  try {
    const workspace = await prisma.organization.create({
      data: { name: 'Database verification', slug },
    });
    expect(workspace.workspaceType).toBe('ORGANIZATION');
    expect(workspace.status).toBe('ACTIVE');
    await expect(
      prisma.organization.create({ data: { name: 'Duplicate', slug } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  } finally {
    await prisma.organization.deleteMany({ where: { slug } });
    await prisma.$disconnect();
  }
});
