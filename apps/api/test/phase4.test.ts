import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { StorageCleanupService } from '../src/storage/storage-cleanup.service.js';
import { validateUpload } from '../src/storage/file-validation.js';
import { parseStorageEnvironment } from '../src/storage/storage-environment.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/graqivo_test')
  throw new Error('Phase 4 tests require isolated graqivo_test database');
process.env.DATABASE_URL = url;
process.env.S3_BUCKET_NAME = 'graqivo-test';
process.env.MINIO_BUCKET_NAME = 'graqivo-test';
process.env.MAX_UPLOAD_SIZE_MB = '1';
process.env.STORAGE_SIGNED_URL_TTL_SECONDS = '2';

function storedZip(entries: [string, string][]) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of entries) {
    const name = Buffer.from(path),
      data = Buffer.from(text);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const origin = process.env.FRONTEND_URL!;
const suffix = randomUUID().slice(0, 8);
const password = 'Phase4-' + randomUUID() + '!';
let app: INestApplication,
  db: PrismaService,
  storage: StorageService,
  cleanup: StorageCleanupService;
type User = { id: string; cookie: string };
let owner: User, foreign: User, creator: User, viewer: User, outsider: User;
let a: { id: string; slug: string }, b: { id: string; slug: string };
let creatorId: string,
  viewerId: string,
  outsiderId: string,
  foreignId: string,
  ownerId: string;
let project: { id: string }, foreignProject: { id: string };
let shared: { id: string },
  privateResource: { id: string },
  foreignResource: { id: string },
  uploaded: { id: string };
const users: string[] = [];
const orgs: string[] = [];
const keys = new Set<string>();
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
);
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
function file(
  id: string,
  buffer = pdf,
  name = 'report.pdf',
  mime = 'application/pdf',
  cookie = owner.cookie,
) {
  return request(app.getHttpServer())
    .post(path('resources/' + id + '/file'))
    .set('Origin', origin)
    .set('Cookie', cookie)
    .attach('file', buffer, { filename: name, contentType: mime });
}
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
      .map((value) => value.split(';')[0])
      .join('; '),
  };
}
async function create(
  title: string,
  body: object = {},
  cookie = owner.cookie,
  slug = a.slug,
) {
  return (
    await call(
      'post',
      path('resources', slug),
      {
        title,
        type: 'LINK',
        source: 'EXTERNAL',
        externalUrl: 'https://example.invalid/resource',
        ...body,
      },
      cookie,
    ).expect(201)
  ).body;
}
async function draft(title: string) {
  return (
    await call(
      'post',
      path('resources'),
      { title, type: 'PDF', source: 'UPLOAD' },
      owner.cookie,
    ).expect(201)
  ).body;
}
describe.sequential('Phase 4 live registry and private storage', () => {
  beforeAll(async () => {
    const { createApplication } = await import('../src/create-app.js');
    app = await createApplication(true);
    await app.init();
    db = app.get(PrismaService);
    storage = app.get(StorageService);
    cleanup = app.get(StorageCleanupService);
    cleanup.stopTimer();
    await storage.provision();
    await db.rateLimit.deleteMany();
    owner = await account('owner');
    foreign = await account('foreign');
    creator = await account('creator');
    viewer = await account('viewer');
    outsider = await account('outsider');
    for (const [label, user] of [
      ['a', owner],
      ['b', foreign],
    ] as const) {
      const response = await call(
        'post',
        '/workspaces',
        {
          name: 'Phase4 ' + label,
          slug: 'phase4-' + label + '-' + suffix,
          workspaceType: 'ORGANIZATION',
        },
        user.cookie,
      ).expect(201);
      orgs.push(response.body.id);
      if (label === 'a') a = response.body;
      else b = response.body;
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
    for (const [user, kind] of [
      [creator, 'creator'],
      [viewer, 'viewer'],
      [outsider, 'outsider'],
    ] as const) {
      const membership = await db.organizationMembership.create({
        data: { organizationId: a.id, userId: user.id },
      });
      if (kind === 'creator') creatorId = membership.id;
      else if (kind === 'viewer') viewerId = membership.id;
      else outsiderId = membership.id;
    }
    project = (
      await call(
        'post',
        path('projects'),
        { name: 'Shared project', status: 'ACTIVE' },
        owner.cookie,
      ).expect(201)
    ).body;
    foreignProject = (
      await call(
        'post',
        path('projects', b.slug),
        { name: 'Foreign project' },
        foreign.cookie,
      ).expect(201)
    ).body;
    await call(
      'post',
      path('projects/' + project.id + '/members'),
      { membershipId: creatorId, role: 'CONTRIBUTOR' },
      owner.cookie,
    ).expect(201);
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
    const resources = await db.resource.findMany({ where });
    for (const resource of resources)
      if (resource.objectKey) keys.add(resource.objectKey);
    const jobs = await db.storageDeletion.findMany({
      where: {
        OR: orgs.map((id) => ({
          key: { startsWith: 'organizations/' + id + '/' },
        })),
      },
    });
    for (const job of jobs) keys.add(job.key);
    for (const key of keys) await storage.remove(key);
    await db.storageDeletion.deleteMany({ where: { key: { in: [...keys] } } });
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
  it('requires valid storage configuration and R2 HTTPS in production', () => {
    expect(() =>
      parseStorageEnvironment({ ...process.env, MAX_UPLOAD_SIZE_MB: '100' }),
    ).toThrow('Invalid configuration');
    expect(() =>
      parseStorageEnvironment({
        ...process.env,
        STORAGE_PROVIDER: 'r2',
        R2_ENDPOINT: 'http://example.invalid',
        R2_ACCESS_KEY_ID: 'local-access',
        R2_SECRET_ACCESS_KEY: 'local-testing-secret',
        R2_BUCKET_NAME: 'test-bucket',
      }),
    ).toThrow('Invalid configuration');
    expect(() =>
      parseStorageEnvironment({ ...process.env, NODE_ENV: 'production' }),
    ).toThrow('Invalid configuration');
  });
  it('creates external metadata and private upload drafts without exposing storage keys', async () => {
    shared = await create(
      'Shared document',
      { type: 'DOCUMENT', projectId: project.id },
      creator.cookie,
    );
    privateResource = await create('Owner only unassigned');
    foreignResource = await create(
      'Foreign secret',
      {},
      foreign.cookie,
      b.slug,
    );
    uploaded = await draft('Private PDF');
    expect(uploaded.uploadState).toBe('PENDING');
    expect(uploaded.objectKey).toBeUndefined();
    const detail = await call(
      'get',
      path('resources/' + shared.id),
      {},
      viewer.cookie,
    ).expect(200);
    expect(detail.body.permissions.edit).toBe(false);
    expect(detail.body.project.name).toBe('Shared project');
  });
  it('scopes registry, search, counts, details, and project filters by tenant and grants', async () => {
    const list = await call('get', path('resources'), {}, viewer.cookie).expect(
      200,
    );
    expect(list.body.total).toBe(1);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([
      shared.id,
    ]);
    await call(
      'get',
      path('resources/' + privateResource.id),
      {},
      viewer.cookie,
    ).expect(404);
    await call(
      'get',
      path('resources/' + foreignResource.id),
      {},
      owner.cookie,
    ).expect(404);
    await call('get', path('resources', b.slug), {}, owner.cookie).expect(403);
    expect(
      (
        await call(
          'get',
          path('resources?search=Owner'),
          {},
          viewer.cookie,
        ).expect(200)
      ).body.total,
    ).toBe(0);
    await call(
      'get',
      path('resources?projectId=' + foreignProject.id),
      {},
      owner.cookie,
    ).expect(404);
    const overview = await call(
      'get',
      path('overview'),
      {},
      viewer.cookie,
    ).expect(200);
    expect(overview.body.resources).toBe(1);
    expect(JSON.stringify(overview.body.recentResources)).not.toContain(
      privateResource.id,
    );
  });
  it('applies all registry filters and stable bounded pagination', async () => {
    for (const query of [
      'type=DOCUMENT',
      'projectId=' + project.id,
      'personId=' + creatorId,
      'mine=true',
      'search=Shared',
      'reviewState=NO_REVIEW',
    ]) {
      const response = await call(
        'get',
        path('resources?' + query),
        {},
        creator.cookie,
      ).expect(200);
      expect(
        response.body.items.map((item: { id: string }) => item.id),
      ).toContain(shared.id);
    }
    const unassigned = await call(
      'get',
      path('resources?unassigned=true'),
      {},
      owner.cookie,
    ).expect(200);
    expect(
      unassigned.body.items.every(
        (item: { projectId: string | null }) => item.projectId === null,
      ),
    ).toBe(true);
    const first = await call(
      'get',
      path('resources?limit=1&page=1'),
      {},
      owner.cookie,
    ).expect(200);
    const second = await call(
      'get',
      path('resources?limit=1&page=2'),
      {},
      owner.cookie,
    ).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0].id).not.toBe(second.body.items[0].id);
    for (const query of [
      'limit=100',
      'page=-1',
      'type=BAD',
      'reviewState=BAD',
      'injected=1',
    ])
      await call('get', path('resources?' + query), {}, owner.cookie).expect(
        400,
      );
  });
  it('enforces Contributor editing and prevents Viewer administration', async () => {
    await call(
      'patch',
      path('resources/' + shared.id),
      { description: 'Contributor update' },
      creator.cookie,
    ).expect(200);
    await call(
      'patch',
      path('resources/' + shared.id),
      { description: 'Viewer attempt' },
      viewer.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources'),
      {
        title: 'Viewer project attempt',
        type: 'LINK',
        source: 'EXTERNAL',
        externalUrl: 'https://example.invalid',
        projectId: project.id,
      },
      viewer.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources/' + shared.id + '/access'),
      { membershipId: outsiderId, permission: 'EDIT' },
      viewer.cookie,
    ).expect(403);
    await call(
      'delete',
      path('resources/' + shared.id),
      {},
      creator.cookie,
    ).expect(403);
  });
  it('allows Members to own unassigned resources while blocking foreign references and unsafe links', async () => {
    const personal = await create('Member own unassigned', {}, viewer.cookie);
    await call(
      'get',
      path('resources/' + personal.id),
      {},
      viewer.cookie,
    ).expect(200);
    await call(
      'get',
      path('resources/' + personal.id),
      {},
      outsider.cookie,
    ).expect(404);
    for (const body of [
      { title: '  ' },
      { projectId: foreignProject.id },
      { ownerMembershipId: foreignId },
      { externalUrl: 'javascript:alert(1)' },
      { externalUrl: 'https://user:secret@example.invalid' },
      { organizationId: b.id },
      { reviewState: 'APPROVED' },
    ]) {
      await call(
        'post',
        path('resources'),
        {
          title: 'Invalid resource',
          type: 'LINK',
          source: 'EXTERNAL',
          externalUrl: 'https://example.invalid',
          ...body,
        },
        owner.cookie,
      ).expect(400);
    }
  });
  it('grants view/edit/review separately, validates tenant recipients, and prevents Edit from resharing', async () => {
    for (const permission of ['VIEW', 'REVIEW', 'EDIT'])
      await call(
        'post',
        path('resources/' + privateResource.id + '/access'),
        { membershipId: outsiderId, permission },
        owner.cookie,
      ).expect(201);
    expect(
      await db.resourceAccess.count({
        where: { resourceId: privateResource.id, membershipId: outsiderId },
      }),
    ).toBe(3);
    await call(
      'post',
      path('resources/' + privateResource.id + '/access'),
      { membershipId: outsiderId, permission: 'EDIT' },
      owner.cookie,
    ).expect(201);
    expect(
      await db.resourceAccess.count({
        where: { resourceId: privateResource.id, membershipId: outsiderId },
      }),
    ).toBe(3);
    await call(
      'patch',
      path('resources/' + privateResource.id),
      { description: 'Explicit edit' },
      outsider.cookie,
    ).expect(200);
    await call(
      'patch',
      path('resources/' + privateResource.id),
      { projectId: project.id },
      outsider.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources/' + privateResource.id + '/access'),
      { membershipId: viewerId, permission: 'EDIT' },
      outsider.cookie,
    ).expect(403);
    await call(
      'post',
      path('resources/' + privateResource.id + '/access'),
      { membershipId: foreignId, permission: 'VIEW' },
      owner.cookie,
    ).expect(400);
    await call(
      'delete',
      path('resources/' + privateResource.id + '/access'),
      { membershipId: outsiderId, permission: 'EDIT' },
      owner.cookie,
    ).expect(200);
    const response = await call(
      'get',
      path('resources/' + privateResource.id),
      {},
      outsider.cookie,
    ).expect(200);
    expect(response.body.permissions.edit).toBe(false);
    expect(response.body.permissions.review).toBe(true);
  });
  it('redacts inaccessible project identity on an explicit resource grant', async () => {
    await call(
      'post',
      path('resources/' + shared.id + '/access'),
      { membershipId: outsiderId, permission: 'VIEW' },
      creator.cookie,
    ).expect(201);
    const response = await call(
      'get',
      path('resources/' + shared.id),
      {},
      outsider.cookie,
    ).expect(200);
    expect(response.body.projectHidden).toBe(true);
    expect(response.body.project).toBeNull();
    expect(response.body.projectId).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('Shared project');
    await call(
      'get',
      path('resources?projectId=' + project.id),
      {},
      outsider.cookie,
    ).expect(404);
  });
  it('enforces same-tenant resource, project, owner, recipient, and grantor constraints in PostgreSQL', async () => {
    await expect(
      db.resource.create({
        data: {
          organizationId: a.id,
          projectId: foreignProject.id,
          title: 'FK project',
          type: 'LINK',
          source: 'EXTERNAL',
          ownerMembershipId: ownerId,
          createdById: ownerId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.resource.create({
        data: {
          organizationId: a.id,
          title: 'FK owner',
          type: 'LINK',
          source: 'EXTERNAL',
          ownerMembershipId: foreignId,
          createdById: ownerId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.resourceAccess.create({
        data: {
          organizationId: a.id,
          resourceId: foreignResource.id,
          membershipId: viewerId,
          grantedById: ownerId,
          permission: 'VIEW',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      db.resourceAccess.create({
        data: {
          organizationId: a.id,
          resourceId: shared.id,
          membershipId: foreignId,
          grantedById: ownerId,
          permission: 'VIEW',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
  it('rejects unauthenticated, foreign, and malicious multipart uploads before storing a file', async () => {
    await file(uploaded.id, pdf, 'report.pdf', 'application/pdf', '').expect(
      401,
    );
    await file(
      uploaded.id,
      pdf,
      'report.pdf',
      'application/pdf',
      viewer.cookie,
    ).expect(404);
    await request(app.getHttpServer())
      .post(path('resources/' + uploaded.id + '/file'))
      .set('Cookie', owner.cookie)
      .set('Origin', 'https://attacker.invalid')
      .attach('file', pdf, {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
    await file(
      uploaded.id,
      Buffer.from('executable'),
      'payload.exe',
      'application/octet-stream',
    ).expect(400);
    await file(
      uploaded.id,
      Buffer.from('not PDF'),
      'forged.pdf',
      'application/pdf',
    ).expect(400);
    await file(uploaded.id, pdf, 'report.pdf', 'text/html').expect(400);
    await file(
      uploaded.id,
      Buffer.alloc(1024 * 1024 + 1, 65),
      'too-large.txt',
      'text/plain',
    ).expect(413);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: uploaded.id } }))
        .objectKey,
    ).toBeNull();
  });
  it('uploads validated content privately and signs attachment downloads with bounded expiry', async () => {
    const response = await file(uploaded.id).expect(201);
    expect(response.body.uploadState).toBe('READY');
    expect(response.body.type).toBe('PDF');
    expect(response.body.objectKey).toBeUndefined();
    const row = await db.resource.findUniqueOrThrow({
      where: { id: uploaded.id },
    });
    keys.add(row.objectKey!);
    expect(row.objectKey).toMatch(new RegExp('^organizations/' + a.id + '/'));
    expect(row.objectKey).not.toContain('report.pdf');
    const raw = new URL(storage.config.endpoint);
    raw.pathname = '/' + storage.config.bucket + '/' + row.objectKey;
    expect((await fetch(raw)).status).toBe(403);
    await call(
      'post',
      path('resources/' + uploaded.id + '/download'),
      {},
      viewer.cookie,
    ).expect(404);
    const signed = await call(
      'post',
      path('resources/' + uploaded.id + '/download'),
      {},
      owner.cookie,
    ).expect(201);
    expect(signed.body.expiresIn).toBe(2);
    expect(new URL(signed.body.url).searchParams.get('X-Amz-Expires')).toBe(
      '2',
    );
    const download = await fetch(signed.body.url);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await download.arrayBuffer()).equals(pdf)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect((await fetch(signed.body.url)).status).toBe(403);
    await file(uploaded.id).expect(409);
  });
  it('records upload failures and retries while cleaning orphaned object claims', async () => {
    const resource = await draft('Retry upload');
    const spy = vi
      .spyOn(storage, 'put')
      .mockRejectedValueOnce(new Error('Simulated storage outage'));
    try {
      await file(resource.id).expect(500);
    } finally {
      spy.mockRestore();
    }
    const failed = await db.resource.findUniqueOrThrow({
      where: { id: resource.id },
    });
    expect(failed.uploadState).toBe('FAILED');
    expect(failed.objectKey).toBeNull();
    await cleanup.drain();
    await file(resource.id).expect(201);
    keys.add(
      (await db.resource.findUniqueOrThrow({ where: { id: resource.id } }))
        .objectKey!,
    );
  });
  it('rechecks authorization after object upload and cleans the object if access was revoked', async () => {
    const resource = await draft('Revoked while uploading');
    await call(
      'post',
      path('resources/' + resource.id + '/access'),
      { membershipId: outsiderId, permission: 'EDIT' },
      owner.cookie,
    ).expect(201);
    const put = storage.put.bind(storage);
    const spy = vi
      .spyOn(storage, 'put')
      .mockImplementationOnce(async (key, body, mime, name) => {
        await put(key, body, mime, name);
        keys.add(key);
        await db.resourceAccess.deleteMany({
          where: { resourceId: resource.id, membershipId: outsiderId },
        });
      });
    try {
      await file(
        resource.id,
        pdf,
        'report.pdf',
        'application/pdf',
        outsider.cookie,
      ).expect(404);
    } finally {
      spy.mockRestore();
    }
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: resource.id } }))
        .uploadState,
    ).toBe('FAILED');
    await cleanup.drain();
  });
  it('archives resources without deleting their private file and supports restoration', async () => {
    await call(
      'patch',
      path('resources/' + uploaded.id),
      { status: 'ARCHIVED' },
      owner.cookie,
    ).expect(200);
    expect(
      (
        await call(
          'get',
          path('resources?status=ARCHIVED'),
          {},
          owner.cookie,
        ).expect(200)
      ).body.items.map((item: { id: string }) => item.id),
    ).toContain(uploaded.id);
    const row = await db.resource.findUniqueOrThrow({
      where: { id: uploaded.id },
    });
    expect(await storage.exists(row.objectKey!)).toBe(true);
    await call(
      'patch',
      path('resources/' + uploaded.id),
      { status: 'ACTIVE' },
      owner.cookie,
    ).expect(200);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: uploaded.id } }))
        .archivedAt,
    ).toBeNull();
  });
  it('soft-deletes metadata, physically deletes files, and retries deletion failures', async () => {
    const key = (
      await db.resource.findUniqueOrThrow({ where: { id: uploaded.id } })
    ).objectKey!;
    const spy = vi
      .spyOn(storage, 'remove')
      .mockRejectedValueOnce(new Error('Simulated deletion outage'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await call(
        'delete',
        path('resources/' + uploaded.id),
        {},
        owner.cookie,
      ).expect(200);
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
    await call(
      'get',
      path('resources/' + uploaded.id),
      {},
      owner.cookie,
    ).expect(404);
    await call(
      'post',
      path('resources/' + uploaded.id + '/download'),
      {},
      owner.cookie,
    ).expect(404);
    const job = await db.storageDeletion.findUniqueOrThrow({ where: { key } });
    expect(job.status).toBe('PENDING');
    await db.storageDeletion.update({
      where: { key },
      data: { availableAt: new Date(0) },
    });
    await cleanup.drain();
    expect(await storage.exists(key)).toBe(false);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: uploaded.id } }))
        .uploadState,
    ).toBe('DELETED');
  });
  it('recovers abandoned upload claims without serving incomplete objects', async () => {
    const resource = await draft('Abandoned upload');
    const key = 'organizations/' + a.id + '/' + randomUUID();
    keys.add(key);
    await storage.put(key, pdf, 'application/pdf', 'abandoned.pdf');
    await db.resource.update({
      where: { id: resource.id },
      data: { objectKey: key, uploadState: 'UPLOADING' },
    });
    await cleanup.enqueue(db, key);
    await cleanup.drain();
    expect(await storage.exists(key)).toBe(false);
    const row = await db.resource.findUniqueOrThrow({
      where: { id: resource.id },
    });
    expect(row.uploadState).toBe('FAILED');
    expect(row.objectKey).toBeNull();
  });

  it('validates Office containers and UTF-8 text while rejecting macro and malformed files', async () => {
    const entries: [string, string][] = [
      ['[Content_Types].xml', '<Types/>'],
      ['word/document.xml', '<document/>'],
    ];
    const docx = storedZip(entries),
      mime =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(
      (
        await validateUpload(
          {
            originalname: 'valid.docx',
            mimetype: mime,
            buffer: docx,
            size: docx.length,
          },
          1024 * 1024,
        )
      ).type,
    ).toBe('DOCUMENT');
    const resource = await draft('Office upload');
    await file(resource.id, docx, 'valid.docx', mime).expect(201);
    keys.add(
      (await db.resource.findUniqueOrThrow({ where: { id: resource.id } }))
        .objectKey!,
    );
    for (const [name, buffer] of [
      ['malformed.docx', Buffer.from('PK bad')],
      ['macro.docx', storedZip([...entries, ['word/vbaProject.bin', 'macro']])],
      ['wrong.xlsx', docx],
    ] as const) {
      await expect(
        validateUpload(
          { originalname: name, mimetype: mime, buffer, size: buffer.length },
          1024 * 1024,
        ),
      ).rejects.toThrow('not allowed');
    }
    const csv = Buffer.from('name,value\nfield,10\n');
    expect(
      (
        await validateUpload(
          {
            originalname: 'data.csv',
            mimetype: 'text/csv',
            buffer: csv,
            size: csv.length,
          },
          1024 * 1024,
        )
      ).type,
    ).toBe('SHEET');
    const binary = Buffer.from([0, 1, 2]);
    await expect(
      validateUpload(
        {
          originalname: 'bad.txt',
          mimetype: 'text/plain',
          buffer: binary,
          size: binary.length,
        },
        1024 * 1024,
      ),
    ).rejects.toThrow('not allowed');
  });

  it('revokes explicit and project access immediately and clears grants on membership suspension', async () => {
    await call(
      'delete',
      path('resources/' + shared.id + '/access'),
      { membershipId: outsiderId, permission: 'VIEW' },
      creator.cookie,
    ).expect(200);
    await call(
      'get',
      path('resources/' + shared.id),
      {},
      outsider.cookie,
    ).expect(404);
    await call(
      'delete',
      path('projects/' + project.id + '/members/' + viewerId),
      {},
      owner.cookie,
    ).expect(200);
    await call('get', path('resources/' + shared.id), {}, viewer.cookie).expect(
      404,
    );
    await call(
      'delete',
      path('members/' + outsiderId),
      {},
      owner.cookie,
    ).expect(200);
    await call(
      'get',
      path('resources/' + privateResource.id),
      {},
      outsider.cookie,
    ).expect(403);
    expect(
      await db.resourceAccess.count({ where: { membershipId: outsiderId } }),
    ).toBe(0);
    await db.organizationMembership.update({
      where: { id: outsiderId },
      data: { status: 'ACTIVE' },
    });
    await call(
      'get',
      path('resources/' + privateResource.id),
      {},
      outsider.cookie,
    ).expect(404);
  });
});
