import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import { StorageCleanupService } from '../src/storage/storage-cleanup.service.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/graqivo_test')
  throw new Error('Phase 5 tests require isolated graqivo_test database');
process.env.DATABASE_URL = url;
const suffix = randomUUID().slice(0, 8),
  password = 'Phase5-' + randomUUID() + '!',
  origin = process.env.FRONTEND_URL!;
type User = { id: string; cookie: string };
let app: INestApplication,
  db: PrismaService,
  owner: User,
  reviewer: User,
  viewer: User,
  foreign: User;
let a: { id: string; slug: string },
  b: { id: string; slug: string },
  project: { id: string },
  privateProject: { id: string };
let ownerId: string, reviewerId: string, viewerId: string, foreignId: string;
const users: string[] = [],
  orgs: string[] = [];
function call(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body: object = {},
  cookie = '',
) {
  const req = request(app.getHttpServer())[method](path).set('Cookie', cookie);
  return method === 'get' ? req : req.set('Origin', origin).send(body);
}
const path = (tail: string, slug = a.slug) =>
  '/workspaces/' + slug + '/' + tail;
async function account(label: string) {
  const email = label + '-' + suffix + '@example.invalid';
  await call('post', '/api/auth/sign-up/email', {
    name: label,
    email,
    password,
  }).expect(200);
  const row = await db.user.update({
    where: { email },
    data: { emailVerified: true },
  });
  users.push(row.id);
  const response = await call('post', '/api/auth/sign-in/email', {
    email,
    password,
  }).expect(200);
  return {
    id: row.id,
    cookie: (response.headers['set-cookie'] as string[])
      .map((v) => v.split(';')[0])
      .join('; '),
  };
}
async function resource(
  title: string,
  body: object = {},
  slug = a.slug,
  cookie = owner.cookie,
) {
  return (
    await call(
      'post',
      path('resources', slug),
      {
        title,
        type: 'DOCUMENT',
        source: 'EXTERNAL',
        externalUrl: 'https://example.invalid/document',
        ...body,
      },
      cookie,
    ).expect(201)
  ).body as { id: string };
}
async function grant(
  id: string,
  membershipId = reviewerId,
  permission = 'REVIEW',
) {
  await call(
    'post',
    path('resources/' + id + '/access'),
    { membershipId, permission },
    owner.cookie,
  ).expect(201);
}
async function start(id: string, membershipId = reviewerId) {
  return (
    await call(
      'post',
      path('resources/' + id + '/review-requests'),
      {
        reviewerMembershipId: membershipId,
        comment: 'Please review this draft',
      },
      owner.cookie,
    ).expect(201)
  ).body as { id: string; round: number };
}
async function ready(title: string) {
  const r = await resource(title);
  await grant(r.id);
  return r;
}
describe.sequential('Phase 5 live reviews and authorized activity', () => {
  beforeAll(async () => {
    const { createApplication } = await import('../src/create-app.js');
    app = await createApplication(true);
    await app.init();
    db = app.get(PrismaService);
    app.get(StorageCleanupService).stopTimer();
    await db.rateLimit.deleteMany();
    owner = await account('owner');
    reviewer = await account('reviewer');
    viewer = await account('viewer');
    foreign = await account('foreign');
    for (const [label, user] of [
      ['a', owner],
      ['b', foreign],
    ] as const) {
      const r = await call(
        'post',
        '/workspaces',
        {
          name: 'Phase5 ' + label,
          slug: 'phase5-' + label + '-' + suffix,
          workspaceType: 'ORGANIZATION',
        },
        user.cookie,
      ).expect(201);
      orgs.push(r.body.id);
      if (label === 'a') a = r.body;
      else b = r.body;
    }
    ownerId = (
      await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: a.id, userId: owner.id },
        },
      })
    ).id;
    foreignId = (
      await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: b.id, userId: foreign.id },
        },
      })
    ).id;
    reviewerId = (
      await db.organizationMembership.create({
        data: { organizationId: a.id, userId: reviewer.id, role: 'MEMBER' },
      })
    ).id;
    viewerId = (
      await db.organizationMembership.create({
        data: { organizationId: a.id, userId: viewer.id, role: 'MEMBER' },
      })
    ).id;
    project = (
      await call(
        'post',
        path('projects'),
        { name: 'Shared review project' },
        owner.cookie,
      ).expect(201)
    ).body;
    privateProject = (
      await call(
        'post',
        path('projects'),
        { name: 'Confidential project' },
        owner.cookie,
      ).expect(201)
    ).body;
    await call(
      'post',
      path('projects/' + project.id + '/members'),
      { membershipId: viewerId, role: 'VIEWER' },
      owner.cookie,
    ).expect(201);
  });
  afterAll(async () => {
    if (!db) return;
    const where = { organizationId: { in: orgs } };
    await db.activity.deleteMany({ where });
    await db.review.deleteMany({ where });
    await db.reviewRequest.deleteMany({ where });
    await db.resourceAccess.deleteMany({ where });
    await db.resourceEvent.deleteMany({ where });
    await db.resource.deleteMany({ where });
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
  it('requires authentication and rejects unknown request fields and pagination', async () => {
    for (const tail of ['reviews', 'activities'])
      await call('get', path(tail)).expect(401);
    const r = await ready('Validation draft');
    await call(
      'post',
      path('resources/' + r.id + '/review-requests'),
      { reviewerMembershipId: reviewerId, organizationId: b.id },
      owner.cookie,
    ).expect(400);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'COMMENT', comment: 'Note', authorMembershipId: ownerId },
      reviewer.cookie,
    ).expect(400);
    await call('get', path('activities?limit=999'), {}, owner.cookie).expect(
      400,
    );
    await call('get', path('reviews?page=0'), {}, owner.cookie).expect(400);
  });
  it('requests review atomically and populates scoped dashboard attention', async () => {
    const r = await ready('Attention draft'),
      q = await start(r.id);
    expect(q.round).toBe(1);
    const row = await db.resource.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.reviewState).toBe('PENDING');
    const dashboard = (
      await call('get', path('overview'), {}, reviewer.cookie).expect(200)
    ).body;
    expect(dashboard.pendingReviews).toBe(1);
    expect(dashboard.needsAttention.map((x: { id: string }) => x.id)).toContain(
      q.id,
    );
    const unrelated = (
      await call('get', path('overview'), {}, viewer.cookie).expect(200)
    ).body;
    expect(unrelated.pendingReviews).toBe(0);
    expect(unrelated.needsAttention).toEqual([]);
  });
  it('permits review comments without deciding the pending request', async () => {
    const r = await ready('Comment draft'),
      q = await start(r.id);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      {
        type: 'COMMENT',
        requestId: q.id,
        comment: 'Please clarify the introduction',
      },
      reviewer.cookie,
    ).expect(201);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: r.id } }))
        .reviewState,
    ).toBe('PENDING');
    expect(
      (await db.reviewRequest.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('PENDING');
    const history = (
      await call(
        'get',
        path('resources/' + r.id + '/reviews'),
        {},
        owner.cookie,
      ).expect(200)
    ).body;
    expect(history.requests[0].reviews[0].author.user.id).toBe(reviewer.id);
    expect(history.requests[0].reviews[0].comment).toContain('clarify');
  });
  it('approves once and preserves reviewer identity and timestamps', async () => {
    const r = await ready('Approval draft'),
      q = await start(r.id);
    const result = await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: q.id, comment: 'Approved' },
      reviewer.cookie,
    ).expect(201);
    expect(result.body.createdAt).toBeTruthy();
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: r.id } }))
        .reviewState,
    ).toBe('APPROVED');
    expect(
      (await db.reviewRequest.findUniqueOrThrow({ where: { id: q.id } }))
        .completedAt,
    ).toBeTruthy();
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      {
        type: 'CHANGES_REQUESTED',
        requestId: q.id,
        comment: 'Second decision',
      },
      reviewer.cookie,
    ).expect(409);
  });
  it('requests changes with a mandatory comment and can open another round', async () => {
    const r = await ready('Changes draft'),
      q = await start(r.id);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'CHANGES_REQUESTED', requestId: q.id, comment: ' ' },
      reviewer.cookie,
    ).expect(400);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      {
        type: 'CHANGES_REQUESTED',
        requestId: q.id,
        comment: 'Revise the dates',
      },
      reviewer.cookie,
    ).expect(201);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: r.id } }))
        .reviewState,
    ).toBe('CHANGES_REQUESTED');
    const next = await start(r.id);
    expect(next.round).toBe(2);
    const history = (
      await call(
        'get',
        path('resources/' + r.id + '/reviews'),
        {},
        reviewer.cookie,
      ).expect(200)
    ).body;
    expect(history.requests).toHaveLength(2);
    expect(history.requests[1].reviews[0].type).toBe('CHANGES_REQUESTED');
  });
  it('prevents VIEW and EDIT permissions from granting review authority', async () => {
    const r = await resource('Viewer draft', { projectId: project.id });
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'COMMENT', comment: 'Unauthorized' },
      viewer.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources/' + r.id + '/review-requests'),
      { reviewerMembershipId: ownerId },
      viewer.cookie,
    ).expect(403);
    await grant(r.id, viewerId, 'EDIT');
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'COMMENT', comment: 'Still unauthorized' },
      viewer.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources/' + r.id + '/review-requests'),
      { reviewerMembershipId: ownerId },
      viewer.cookie,
    ).expect(201);
  });
  it('checks assignment separately from review permission', async () => {
    const r = await ready('Assigned reviewer draft');
    await grant(r.id, viewerId, 'REVIEW');
    const q = await start(r.id);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: q.id },
      viewer.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      {
        type: 'COMMENT',
        requestId: q.id,
        comment: 'Additional reviewer comment',
      },
      viewer.cookie,
    ).expect(201);
  });
  it('allows administrative decisions and standalone review comments', async () => {
    const r = await ready('Administrative draft'),
      q = await start(r.id);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: q.id },
      owner.cookie,
    ).expect(201);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'COMMENT', comment: 'Follow-up note' },
      owner.cookie,
    ).expect(201);
    const history = (
      await call(
        'get',
        path('resources/' + r.id + '/reviews'),
        {},
        owner.cookie,
      ).expect(200)
    ).body;
    expect(history.comments[0].author.user.id).toBe(owner.id);
  });
  it('rejects inaccessible, foreign and non-reviewing assignees', async () => {
    const r = await resource('Assignee checks');
    for (const id of [foreignId, viewerId, reviewerId])
      await call(
        'post',
        path('resources/' + r.id + '/review-requests'),
        { reviewerMembershipId: id },
        owner.cookie,
      ).expect(400);
    expect(
      (
        await call(
          'get',
          path('resources/' + r.id + '/reviewers'),
          {},
          owner.cookie,
        ).expect(200)
      ).body.map((x: { id: string }) => x.id),
    ).toEqual([ownerId]);
  });
  it('blocks cross-tenant review IDs and direct resource access', async () => {
    const local = await ready('Local isolation'),
      q = await start(local.id);
    const secret = await resource(
      'Foreign review secret',
      {},
      b.slug,
      foreign.cookie,
    );
    await call(
      'get',
      path('resources/' + secret.id + '/reviews'),
      {},
      owner.cookie,
    ).expect(404);
    await call(
      'get',
      path('resources/' + local.id + '/reviews', b.slug),
      {},
      foreign.cookie,
    ).expect(404);
    await call(
      'post',
      path('resources/' + secret.id + '/reviews', b.slug),
      { type: 'APPROVAL', requestId: q.id },
      foreign.cookie,
    ).expect(409);
    await call(
      'get',
      path('activities?resourceId=' + secret.id),
      {},
      owner.cookie,
    ).expect(404);
    await call(
      'get',
      path('reviews?projectId=' + privateProject.id, b.slug),
      {},
      foreign.cookie,
    ).expect(404);
  });
  it('checks current grants and removes revoked reviewer dashboard actions', async () => {
    const r = await ready('Revoked review'),
      q = await start(r.id);
    await grant(r.id, reviewerId, 'VIEW');
    await call(
      'delete',
      path('resources/' + r.id + '/access'),
      { membershipId: reviewerId, permission: 'REVIEW' },
      owner.cookie,
    ).expect(200);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: q.id },
      reviewer.cookie,
    ).expect(403);
    const overview = (
      await call('get', path('overview'), {}, reviewer.cookie).expect(200)
    ).body;
    expect(
      overview.needsAttention.some((x: { id: string }) => x.id === q.id),
    ).toBe(false);
    await call(
      'delete',
      path('resources/' + r.id + '/access'),
      { membershipId: reviewerId, permission: 'VIEW' },
      owner.cookie,
    ).expect(200);
    await call(
      'get',
      path('resources/' + r.id + '/reviews'),
      {},
      reviewer.cookie,
    ).expect(404);
  });
  it('cancels requests without deleting review history', async () => {
    const r = await ready('Cancel draft'),
      q = await start(r.id);
    await call(
      'post',
      path('resources/' + r.id + '/review-requests/' + q.id + '/cancel'),
      {},
      reviewer.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources/' + r.id + '/review-requests/' + q.id + '/cancel'),
      {},
      owner.cookie,
    ).expect(201);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: q.id },
      reviewer.cookie,
    ).expect(409);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: r.id } }))
        .reviewState,
    ).toBe('NO_REVIEW');
    expect(
      (await db.reviewRequest.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('CANCELLED');
  });
  it('invalidates pending and approved reviews when content changes', async () => {
    const r = await ready('Content version'),
      q = await start(r.id);
    await call(
      'patch',
      path('resources/' + r.id),
      { description: 'Rewritten draft' },
      owner.cookie,
    ).expect(200);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: q.id },
      reviewer.cookie,
    ).expect(409);
    const next = await start(r.id);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: next.id },
      reviewer.cookie,
    ).expect(201);
    await call(
      'patch',
      path('resources/' + r.id),
      { title: 'Content version', description: 'Rewritten draft' },
      owner.cookie,
    ).expect(200);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: r.id } }))
        .reviewState,
    ).toBe('APPROVED');
    await call(
      'patch',
      path('resources/' + r.id),
      { externalUrl: 'https://example.invalid/new-version' },
      owner.cookie,
    ).expect(200);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: r.id } }))
        .reviewState,
    ).toBe('NO_REVIEW');
    expect(
      await db.review.count({ where: { resourceId: r.id, type: 'APPROVAL' } }),
    ).toBe(1);
  });
  it('blocks archived and incomplete uploads, and closes deleted requests', async () => {
    const r = await ready('Archive review'),
      q = await start(r.id);
    await call(
      'patch',
      path('resources/' + r.id),
      { status: 'ARCHIVED' },
      owner.cookie,
    ).expect(200);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'COMMENT', comment: 'Archived' },
      reviewer.cookie,
    ).expect(409);
    await call(
      'post',
      path('resources/' + r.id + '/review-requests'),
      { reviewerMembershipId: reviewerId },
      owner.cookie,
    ).expect(409);
    const draft = await resource('Incomplete upload', {
      source: 'UPLOAD',
      type: 'PDF',
      externalUrl: undefined,
    });
    await call(
      'post',
      path('resources/' + draft.id + '/review-requests'),
      { reviewerMembershipId: ownerId },
      owner.cookie,
    ).expect(409);
    expect(
      (await db.reviewRequest.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('CANCELLED');
    const deleted = await ready('Deleted review'),
      pending = await start(deleted.id);
    await call(
      'delete',
      path('resources/' + deleted.id),
      {},
      owner.cookie,
    ).expect(200);
    expect(
      (await db.reviewRequest.findUniqueOrThrow({ where: { id: pending.id } }))
        .status,
    ).toBe('CANCELLED');
    await call(
      'get',
      path('activities?resourceId=' + deleted.id),
      {},
      owner.cookie,
    ).expect(404);
  });
  it('serializes simultaneous requests and simultaneous competing decisions', async () => {
    const r = await ready('Concurrent review');
    const creates = await Promise.all(
      [1, 2].map(() =>
        call(
          'post',
          path('resources/' + r.id + '/review-requests'),
          { reviewerMembershipId: reviewerId },
          owner.cookie,
        ),
      ),
    );
    expect(creates.map((x) => x.status).sort()).toEqual([201, 409]);
    const q = creates.find((x) => x.status === 201)!.body;
    const results = await Promise.all(
      ['APPROVAL', 'CHANGES_REQUESTED'].map((type) =>
        call(
          'post',
          path('resources/' + r.id + '/reviews'),
          { type, requestId: q.id, comment: 'Concurrent decision' },
          reviewer.cookie,
        ),
      ),
    );
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(await db.review.count({ where: { requestId: q.id } })).toBe(1);
    expect(
      await db.activity.count({
        where: {
          resourceId: r.id,
          action: { in: ['REVIEW_APPROVED', 'REVIEW_CHANGES_REQUESTED'] },
        },
      }),
    ).toBe(1);
  });
  it('enforces tenant and resource consistency through database constraints', async () => {
    const r = await ready('Constraint review'),
      q = await start(r.id),
      other = await ready('Other constraint draft');
    await expect(
      db.reviewRequest.create({
        data: {
          organizationId: a.id,
          resourceId: r.id,
          requesterMembershipId: ownerId,
          reviewerMembershipId: foreignId,
          round: 99,
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.review.create({
        data: {
          organizationId: a.id,
          resourceId: other.id,
          requestId: q.id,
          authorMembershipId: ownerId,
          type: 'APPROVAL',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.activity.create({
        data: {
          organizationId: a.id,
          resourceId: r.id,
          projectId: privateProject.id,
          actorMembershipId: foreignId,
          visibility: 'RESOURCE',
          action: 'TEST',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
  it('provides authorized organization, project and resource feeds without audit metadata', async () => {
    const r = await resource('Feed project document', {
      projectId: project.id,
    });
    await grant(r.id);
    const q = await start(r.id);
    await call(
      'post',
      path('resources/' + r.id + '/reviews'),
      { type: 'APPROVAL', requestId: q.id },
      reviewer.cookie,
    ).expect(201);
    const feed = (
      await call(
        'get',
        path('activities?projectId=' + project.id),
        {},
        viewer.cookie,
      ).expect(200)
    ).body;
    expect(
      feed.items.some(
        (x: { action: string }) => x.action === 'REVIEW_APPROVED',
      ),
    ).toBe(true);
    const resourceFeed = (
      await call(
        'get',
        path('activities?resourceId=' + r.id),
        {},
        viewer.cookie,
      ).expect(200)
    ).body;
    expect(
      resourceFeed.items.some(
        (x: { action: string }) => x.action === 'RESOURCE_CREATED',
      ),
    ).toBe(true);
    expect(JSON.stringify(resourceFeed)).not.toMatch(
      /objectKey|metadata|tokenHash|externalUrl/,
    );
    await call(
      'post',
      path('invitations'),
      { email: 'invite-' + suffix + '@example.invalid', role: 'MEMBER' },
      owner.cookie,
    ).expect(201);
    const admin = (
      await call('get', path('activities'), {}, owner.cookie).expect(200)
    ).body;
    expect(
      admin.items.some(
        (x: { action: string }) => x.action === 'MEMBER_INVITED',
      ),
    ).toBe(true);
    const member = (
      await call('get', path('activities'), {}, viewer.cookie).expect(200)
    ).body;
    expect(
      member.items.some(
        (x: { visibility: string }) => x.visibility === 'ADMIN',
      ),
    ).toBe(false);
  });
  it('redacts inaccessible project context and scopes review lists, search and pagination', async () => {
    const r = await resource('Private project shared document', {
      projectId: privateProject.id,
    });
    await grant(r.id);
    await start(r.id);
    const feed = (
      await call(
        'get',
        path('activities?resourceId=' + r.id),
        {},
        reviewer.cookie,
      ).expect(200)
    ).body;
    expect(
      feed.items.every((x: { project: unknown }) => x.project === null),
    ).toBe(true);
    expect(JSON.stringify(feed)).not.toContain(privateProject.id);
    await call(
      'get',
      path('activities?projectId=' + privateProject.id),
      {},
      reviewer.cookie,
    ).expect(404);
    const requests = (
      await call(
        'get',
        path('reviews?mine=true&status=PENDING&limit=2'),
        {},
        reviewer.cookie,
      ).expect(200)
    ).body;
    expect(requests.items).toHaveLength(2);
    expect(
      requests.items.every(
        (x: { reviewer: { id: string } }) => x.reviewer.id === reviewerId,
      ),
    ).toBe(true);
    const registry = (
      await call(
        'get',
        path('resources?reviewState=PENDING'),
        {},
        reviewer.cookie,
      ).expect(200)
    ).body;
    expect(registry.items.some((x: { id: string }) => x.id === r.id)).toBe(
      true,
    );
    const empty = (
      await call(
        'get',
        path('reviews?projectId=' + project.id + '&status=PENDING'),
        {},
        viewer.cookie,
      ).expect(200)
    ).body;
    expect(
      empty.items.every(
        (x: { resource: { id: string } }) => x.resource.id !== r.id,
      ),
    ).toBe(true);
  });
  it('hides project and resource activity after project access is removed', async () => {
    const r = await resource('Removal project document', {
      projectId: project.id,
    });
    const before = (
      await call(
        'get',
        path('activities?resourceId=' + r.id),
        {},
        viewer.cookie,
      ).expect(200)
    ).body;
    expect(before.total).toBeGreaterThan(0);
    await call(
      'delete',
      path('projects/' + project.id + '/members/' + viewerId),
      {},
      owner.cookie,
    ).expect(200);
    await call(
      'get',
      path('activities?resourceId=' + r.id),
      {},
      viewer.cookie,
    ).expect(404);
    await call(
      'get',
      path('reviews?projectId=' + project.id),
      {},
      viewer.cookie,
    ).expect(404);
    const all = (
      await call('get', path('activities?limit=50'), {}, viewer.cookie).expect(
        200,
      )
    ).body;
    expect(
      all.items.some(
        (x: { resource: { id: string } | null }) => x.resource?.id === r.id,
      ),
    ).toBe(false);
  });
  it('protects immutable review history and activity from client modification', async () => {
    const r = await ready('Immutable review'),
      q = await start(r.id);
    const review = (
      await call(
        'post',
        path('resources/' + r.id + '/reviews'),
        { type: 'APPROVAL', requestId: q.id, comment: 'Final record' },
        reviewer.cookie,
      ).expect(201)
    ).body;
    await call(
      'patch',
      path('resources/' + r.id + '/reviews/' + review.id),
      { comment: 'Tampered' },
      owner.cookie,
    ).expect(404);
    await call(
      'delete',
      path('resources/' + r.id + '/reviews/' + review.id),
      {},
      owner.cookie,
    ).expect(404);
    await call(
      'post',
      path('activities'),
      { action: 'REVIEW_APPROVED' },
      owner.cookie,
    ).expect(404);
    expect(
      (await db.review.findUniqueOrThrow({ where: { id: review.id } })).comment,
    ).toBe('Final record');
  });

  it('rejects all review and activity access immediately after workspace revocation', async () => {
    await call(
      'delete',
      path('members/' + reviewerId),
      {},
      owner.cookie,
    ).expect(200);
    for (const tail of ['reviews', 'activities', 'overview'])
      await call('get', path(tail), {}, reviewer.cookie).expect(403);
  });
});
