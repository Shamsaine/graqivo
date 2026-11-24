import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/graqivo_test')
  throw new Error('Phase 3 tests require isolated graqivo_test database');
process.env.DATABASE_URL = url;
const origin = process.env.FRONTEND_URL!;
const suffix = randomUUID().slice(0, 8);
const password = 'Phase3-' + randomUUID() + '!';
let app: INestApplication, db: PrismaService;
type User = { id: string; cookie: string };
let owner: User, foreign: User, member: User, admin: User;
let a: { id: string; slug: string },
  b: { id: string; slug: string },
  personal: { id: string; slug: string };
let memberId: string, adminId: string, foreignId: string;
let shared: { id: string },
  hidden: { id: string },
  foreignProject: { id: string };
const users: string[] = [];
const orgs: string[] = [];
function call(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body: object = {},
  cookie = '',
) {
  const req = request(app.getHttpServer())[method](path).set('Cookie', cookie);
  return method === 'get' ? req : req.set('Origin', origin).send(body);
}
const path = (slug: string, tail: string) => '/workspaces/' + slug + '/' + tail;
async function account(label: string) {
  const email = label + '-' + suffix + '@example.invalid';
  await call('post', '/api/auth/sign-up/email', {
    name: label,
    email,
    password,
  }).expect(200);
  const user = await db.user.update({
    where: { email },
    data: { emailVerified: true },
  });
  users.push(user.id);
  const response = await call('post', '/api/auth/sign-in/email', {
    email,
    password,
  }).expect(200);
  return {
    id: user.id,
    cookie: (response.headers['set-cookie'] as string[])
      .map((cookie) => cookie.split(';')[0])
      .join('; '),
  };
}
describe.sequential('Phase 3 live project and workspace authorization', () => {
  beforeAll(async () => {
    app = await createApplication(true);
    await app.init();
    db = app.get(PrismaService);
    await db.rateLimit.deleteMany();
    owner = await account('owner');
    foreign = await account('foreign');
    member = await account('member');
    admin = await account('admin');
    for (const [label, user, type] of [
      ['a', owner, 'ORGANIZATION'],
      ['b', foreign, 'ORGANIZATION'],
      ['personal', owner, 'PERSONAL'],
    ] as const) {
      const response = await call(
        'post',
        '/workspaces',
        {
          name: 'Phase3 ' + label,
          slug: 'phase3-' + label + '-' + suffix,
          workspaceType: type,
        },
        user.cookie,
      ).expect(201);
      orgs.push(response.body.id);
      if (label === 'a') a = response.body;
      else if (label === 'b') b = response.body;
      else personal = response.body;
    }
    memberId = (
      await db.organizationMembership.create({
        data: { organizationId: a.id, userId: member.id, role: 'MEMBER' },
      })
    ).id;
    adminId = (
      await db.organizationMembership.create({
        data: { organizationId: a.id, userId: admin.id, role: 'ADMIN' },
      })
    ).id;
    foreignId = (
      await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: b.id, userId: foreign.id },
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    const where = { organizationId: { in: orgs } };
    await db.activity.deleteMany({ where });
    await db.projectEvent.deleteMany({ where });
    await db.projectMembership.deleteMany({ where });
    await db.project.deleteMany({ where });
    await db.auditEvent.deleteMany({
      where: { OR: [where, { actorId: { in: users } }] },
    });
    await db.invitation.deleteMany({ where });
    await db.organizationMembership.deleteMany({ where });
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });
  it('requires authentication on every new workspace endpoint', async () => {
    for (const tail of ['overview', 'people', 'projects'])
      await call('get', path(a.slug, tail)).expect(401);
    await call('patch', path(a.slug, 'settings'), {
      name: 'Unauthorized',
    }).expect(401);
  });
  it('creates projects atomically with creator and lead participants', async () => {
    const response = await call(
      'post',
      path(a.slug, 'projects'),
      {
        name: 'Shared field work',
        description: 'Shared work',
        status: 'ACTIVE',
        leadMembershipId: memberId,
        startDate: '2026-10-01',
        targetDate: '2026-11-30',
      },
      owner.cookie,
    ).expect(201);
    shared = response.body;
    hidden = (
      await call(
        'post',
        path(a.slug, 'projects'),
        { name: 'Confidential planning' },
        admin.cookie,
      ).expect(201)
    ).body;
    foreignProject = (
      await call(
        'post',
        path(b.slug, 'projects'),
        { name: 'Other workspace secret', status: 'ACTIVE' },
        foreign.cookie,
      ).expect(201)
    ).body;
    const data = await call(
      'get',
      path(a.slug, 'projects/' + shared.id),
      {},
      member.cookie,
    ).expect(200);
    expect(data.body.memberships).toHaveLength(2);
    expect(data.body.lead.user.id).toBe(member.id);
    expect(
      data.body.events.map((event: { action: string }) => event.action),
    ).toContain('PROJECT_CREATED');
  });
  it('scopes project lists, direct IDs, and administration by current role', async () => {
    const list = await call(
      'get',
      path(a.slug, 'projects'),
      {},
      member.cookie,
    ).expect(200);
    expect(list.body.map((project: { id: string }) => project.id)).toEqual([
      shared.id,
    ]);
    await call(
      'get',
      path(a.slug, 'projects/' + hidden.id),
      {},
      member.cookie,
    ).expect(404);
    await call(
      'get',
      path(a.slug, 'projects/' + foreignProject.id),
      {},
      owner.cookie,
    ).expect(404);
    for (const tail of ['overview', 'people', 'projects'])
      await call('get', path(b.slug, tail), {}, owner.cookie).expect(403);
    await call(
      'post',
      path(a.slug, 'projects'),
      { name: 'Member attempt' },
      member.cookie,
    ).expect(403);
    await call(
      'patch',
      path(a.slug, 'projects/' + shared.id),
      { name: 'Lead attempt' },
      member.cookie,
    ).expect(403);
    await call(
      'patch',
      path(a.slug, 'projects/' + foreignProject.id),
      { status: 'ARCHIVED' },
      owner.cookie,
    ).expect(404);
  });
  it('restricts workspace settings to Owners and validates profile fields', async () => {
    const response = await call(
      'patch',
      path(a.slug, 'settings'),
      {
        name: 'Updated organization',
        displayName: 'Field team',
        description: 'Connected work',
        theme: 'teal',
        logoUrl: 'https://example.invalid/logo.png',
      },
      owner.cookie,
    ).expect(200);
    expect(response.body.displayName).toBe('Field team');
    expect(response.body.slug).toBe(a.slug);
    await call(
      'patch',
      path(a.slug, 'settings'),
      { theme: 'rose' },
      admin.cookie,
    ).expect(403);
    await call(
      'patch',
      path(a.slug, 'settings'),
      { theme: 'rose' },
      member.cookie,
    ).expect(403);
    await call(
      'patch',
      path(b.slug, 'settings'),
      { name: 'Foreign' },
      owner.cookie,
    ).expect(403);
    for (const body of [
      { theme: 'unknown' },
      { theme: null },
      { name: '  ' },
      { status: 'DISABLED' },
      { slug: 'changed' },
      { logoUrl: 'http://example.invalid/logo.png' },
    ])
      await call('patch', path(a.slug, 'settings'), body, owner.cookie).expect(
        400,
      );
    await call(
      'patch',
      path(a.slug, 'settings'),
      { logoUrl: null },
      owner.cookie,
    ).expect(200);
  });
  it('rejects invalid dates, fields, and foreign lead assignments without partial writes', async () => {
    const count = await db.project.count({ where: { organizationId: a.id } });
    for (const body of [
      { name: '  ' },
      { name: 'Bad date', startDate: '2026-02-30' },
      { name: 'Reversed', startDate: '2026-12-01', targetDate: '2026-11-01' },
      { name: 'Foreign lead', leadMembershipId: foreignId },
      { name: 'Injected', organizationId: b.id },
      { name: 'Null status', status: null },
    ]) {
      await call('post', path(a.slug, 'projects'), body, owner.cookie).expect(
        400,
      );
    }
    expect(await db.project.count({ where: { organizationId: a.id } })).toBe(
      count,
    );
    await call(
      'patch',
      path(a.slug, 'projects/' + shared.id),
      { startDate: null, targetDate: null },
      owner.cookie,
    ).expect(200);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: shared.id } }))
        .startDate,
    ).toBeNull();
  });
  it('keeps overview counts and People project/activity metadata scoped to accessible projects', async () => {
    const overview = await call(
      'get',
      path(a.slug, 'overview'),
      {},
      member.cookie,
    ).expect(200);
    expect(overview.body.activeProjectCount).toBe(1);
    expect(
      overview.body.projects.map((project: { id: string }) => project.id),
    ).toEqual([shared.id]);
    expect(JSON.stringify(overview.body)).not.toContain(hidden.id);
    expect(JSON.stringify(overview.body)).not.toContain(foreignProject.id);
    expect(overview.body.resources).toBe(0);
    expect(overview.body.pendingReviews).toBe(0);
    const people = await call(
      'get',
      path(a.slug, 'people'),
      {},
      member.cookie,
    ).expect(200);
    expect(people.body).toHaveLength(3);
    expect(JSON.stringify(people.body)).not.toContain(hidden.id);
    expect(JSON.stringify(people.body)).not.toContain(foreign.id);
    expect(
      people.body.every(
        (person: { status: string }) => person.status === 'ACTIVE',
      ),
    ).toBe(true);
  });
  it('validates participants and upserts unique project memberships', async () => {
    const endpoint = path(a.slug, 'projects/' + shared.id + '/members');
    await call(
      'post',
      endpoint,
      { membershipId: adminId, role: 'VIEWER' },
      owner.cookie,
    ).expect(201);
    await call(
      'post',
      endpoint,
      { membershipId: adminId, role: 'CONTRIBUTOR' },
      owner.cookie,
    ).expect(201);
    expect(
      await db.projectMembership.count({
        where: { projectId: shared.id, membershipId: adminId },
      }),
    ).toBe(1);
    await call(
      'post',
      endpoint,
      { membershipId: foreignId, role: 'VIEWER' },
      owner.cookie,
    ).expect(400);
    await call(
      'post',
      endpoint,
      { membershipId: adminId, role: 'OWNER' },
      owner.cookie,
    ).expect(400);
    await call(
      'post',
      endpoint,
      { membershipId: adminId, role: 'VIEWER' },
      member.cookie,
    ).expect(403);
    await call(
      'post',
      endpoint,
      { membershipId: memberId, role: 'VIEWER' },
      owner.cookie,
    ).expect(400);
    await call('delete', endpoint + '/' + memberId, {}, owner.cookie).expect(
      400,
    );
  });
  it('enforces same-tenant project and participant foreign keys in PostgreSQL', async () => {
    await expect(
      db.projectMembership.create({
        data: {
          organizationId: a.id,
          projectId: foreignProject.id,
          membershipId: memberId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.projectMembership.create({
        data: {
          organizationId: a.id,
          projectId: shared.id,
          membershipId: foreignId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const creator = await db.organizationMembership.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: a.id, userId: owner.id },
      },
    });
    await expect(
      db.project.create({
        data: {
          organizationId: a.id,
          name: 'Foreign lead FK',
          createdById: creator.id,
          leadMembershipId: foreignId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
  it('supports every status and retains archive history while stopping participant changes', async () => {
    for (const status of ['ON_HOLD', 'COMPLETED', 'ARCHIVED'])
      await call(
        'patch',
        path(a.slug, 'projects/' + shared.id),
        { status },
        admin.cookie,
      ).expect(200);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: shared.id } }))
        .archivedAt,
    ).not.toBeNull();
    const overview = await call(
      'get',
      path(a.slug, 'overview'),
      {},
      member.cookie,
    ).expect(200);
    expect(overview.body.activeProjectCount).toBe(0);
    expect(overview.body.projects).toHaveLength(0);
    const detail = await call(
      'get',
      path(a.slug, 'projects/' + shared.id),
      {},
      member.cookie,
    ).expect(200);
    expect(
      detail.body.events.map((event: { action: string }) => event.action),
    ).toContain('PROJECT_ARCHIVED');
    await call(
      'post',
      path(a.slug, 'projects/' + shared.id + '/members'),
      { membershipId: adminId, role: 'VIEWER' },
      owner.cookie,
    ).expect(400);
    await call(
      'patch',
      path(a.slug, 'projects/' + shared.id),
      { status: 'ACTIVE' },
      owner.cookie,
    ).expect(200);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: shared.id } }))
        .archivedAt,
    ).toBeNull();
  });
  it('removes project access immediately after participant removal', async () => {
    await call(
      'patch',
      path(a.slug, 'projects/' + shared.id),
      { leadMembershipId: null },
      owner.cookie,
    ).expect(200);
    await call(
      'delete',
      path(a.slug, 'projects/' + shared.id + '/members/' + memberId),
      {},
      owner.cookie,
    ).expect(200);
    await call(
      'get',
      path(a.slug, 'projects/' + shared.id),
      {},
      member.cookie,
    ).expect(404);
    expect(
      (
        await call('get', path(a.slug, 'overview'), {}, member.cookie).expect(
          200,
        )
      ).body.activeProjectCount,
    ).toBe(0);
    await call(
      'patch',
      path(a.slug, 'projects/' + shared.id),
      { leadMembershipId: memberId },
      owner.cookie,
    ).expect(200);
  });
  it('revokes organization access and clears project grants and lead before reactivation', async () => {
    await call(
      'delete',
      path(a.slug, 'members/' + memberId),
      {},
      owner.cookie,
    ).expect(200);
    await call('get', path(a.slug, 'overview'), {}, member.cookie).expect(403);
    await call(
      'get',
      path(a.slug, 'projects/' + shared.id),
      {},
      member.cookie,
    ).expect(403);
    expect(
      await db.projectMembership.count({ where: { membershipId: memberId } }),
    ).toBe(0);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: shared.id } }))
        .leadMembershipId,
    ).toBeNull();
    await db.organizationMembership.update({
      where: { id: memberId },
      data: { status: 'ACTIVE' },
    });
    await call(
      'get',
      path(a.slug, 'projects/' + shared.id),
      {},
      member.cookie,
    ).expect(404);
    await db.organizationMembership.update({
      where: { id: memberId },
      data: { status: 'REVOKED' },
    });
    await call(
      'post',
      path(a.slug, 'projects/' + shared.id + '/members'),
      { membershipId: memberId, role: 'VIEWER' },
      owner.cookie,
    ).expect(400);
  });
  it('supports personal projects without exposing them in organization views', async () => {
    const result = await call(
      'post',
      path(personal.slug, 'projects'),
      { name: 'My personal project', status: 'ACTIVE' },
      owner.cookie,
    ).expect(201);
    await call(
      'get',
      path(personal.slug, 'projects/' + result.body.id),
      {},
      member.cookie,
    ).expect(403);
    expect(
      JSON.stringify(
        (
          await call('get', path(a.slug, 'overview'), {}, owner.cookie).expect(
            200,
          )
        ).body,
      ),
    ).not.toContain(result.body.id);
    expect(
      (
        await call(
          'get',
          path(personal.slug, 'people'),
          {},
          owner.cookie,
        ).expect(200)
      ).body,
    ).toHaveLength(1);
  });
  it('records mutations in append-only server-owned activity and audits', async () => {
    const events = await db.projectEvent.findMany({
      where: { projectId: shared.id },
    });
    for (const action of [
      'PROJECT_CREATED',
      'PROJECT_UPDATED',
      'PROJECT_ARCHIVED',
      'PROJECT_PARTICIPANT_UPDATED',
      'PROJECT_PARTICIPANT_REMOVED',
    ])
      expect(events.map((event) => event.action)).toContain(action);
    expect(
      await db.auditEvent.count({
        where: { organizationId: a.id, action: 'WORKSPACE_SETTINGS_UPDATED' },
      }),
    ).toBeGreaterThan(0);
    await call(
      'patch',
      path(a.slug, 'projects/' + shared.id + '/activity'),
      { action: 'Faked' },
      owner.cookie,
    ).expect(404);
  });
});
