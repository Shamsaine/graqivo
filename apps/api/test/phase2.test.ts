import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getAuthTables } from 'better-auth/db';
import { signJWT } from 'better-auth/crypto';
import { createApplication } from '../src/create-app.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { EmailService } from '../src/email/email.service.js';
import { parseAuthEnvironment } from '../src/config/auth-environment.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || new URL(testUrl).pathname !== '/graqivo_test')
  throw new Error(
    'Phase 2 tests require TEST_DATABASE_URL pointing to the isolated graqivo_test database',
  );
process.env.DATABASE_URL = testUrl;
const origin = process.env.FRONTEND_URL!;
const suffix = randomUUID().slice(0, 8);
const password = 'Testing-' + randomUUID() + '-123!';
type Fixture = { id: string; email: string; cookie: string };
let app: INestApplication;
let db: PrismaService;
let ownerA: Fixture, ownerB: Fixture, admin: Fixture, member: Fixture;
let orgA: { id: string; slug: string }, orgB: { id: string; slug: string };
const userIds: string[] = [];
const organizationIds: string[] = [];
const emailIds = new Set<string>();
function post(path: string, body: object, cookie = '') {
  return request(app.getHttpServer())
    .post(path)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .send(body);
}
function mutate(
  method: 'patch' | 'delete',
  path: string,
  body: object,
  cookie: string,
) {
  return request(app.getHttpServer())
    [method](path)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .send(body);
}
function get(path: string, cookie = '') {
  return request(app.getHttpServer()).get(path).set('Cookie', cookie);
}
function cookies(response: request.Response) {
  const values = response.headers['set-cookie'] as string[] | undefined;
  return (values ?? []).map((value) => value.split(';')[0]).join('; ');
}
async function emailLink(address: string, subject: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await app.get(EmailService).drain();
    const result = await fetch(
      'http://127.0.0.1:8025/api/v1/messages?limit=200',
    );
    const list = (await result.json()) as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    const found = list.messages.find(
      (message) =>
        !emailIds.has(message.ID) &&
        message.Subject.includes(subject) &&
        message.To.some(
          (recipient) =>
            recipient.Address.toLowerCase() === address.toLowerCase(),
        ),
    );
    if (found) {
      emailIds.add(found.ID);
      const detail = await fetch(
        'http://127.0.0.1:8025/api/v1/message/' + found.ID,
      );
      const message = (await detail.json()) as { Text: string };
      const url = message.Text.match(/https?:\/\/[^\s]+/)?.[0];
      if (url) return new URL(url);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Expected local test email did not arrive');
}
async function signIn(email: string, pwd = password) {
  const response = await post('/api/auth/sign-in/email', {
    email,
    password: pwd,
  }).expect(200);
  expect(
    (response.headers['set-cookie'] as string[]).some(
      (value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value),
    ),
  ).toBe(true);
  return cookies(response);
}
async function account(label: string) {
  const email = (label + '-' + suffix + '@example.invalid').toLowerCase();
  await post('/api/auth/sign-up/email', {
    name: label,
    email,
    password,
    callbackURL: origin + '/login?verified=1',
  }).expect(200);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  userIds.push(user.id);
  const url = await emailLink(email, 'Verify your Graqivo email');
  const response = await get(url.pathname + url.search).expect(302);
  expect(response.headers.location).toContain('/login?verified=1');
  return { id: user.id, email, cookie: await signIn(email) };
}
async function invite(
  sender: Fixture,
  slug: string,
  recipient: Fixture,
  role = 'MEMBER',
) {
  const response = await post(
    '/workspaces/' + slug + '/invitations',
    { email: recipient.email, role },
    sender.cookie,
  ).expect(201);
  const url = await emailLink(recipient.email, 'Join ');
  const token = new URLSearchParams(url.hash.slice(1)).get('token')!;
  return { id: response.body.id as string, token, body: response.body };
}
describe.sequential(
  'Phase 2 real authentication and tenant authorization',
  () => {
    beforeAll(async () => {
      app = await createApplication(true);
      await app.init();
      db = app.get(PrismaService);
      await db.rateLimit.deleteMany();
    });
    afterAll(async () => {
      if (!db) return;
      await db.auditEvent.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { organizationId: { in: organizationIds } },
          ],
        },
      });
      await db.invitation.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.organizationMembership.deleteMany({
        where: {
          OR: [
            { organizationId: { in: organizationIds } },
            { userId: { in: userIds } },
          ],
        },
      });
      await db.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      for (const id of emailIds)
        await fetch('http://127.0.0.1:8025/api/v1/messages', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDs: [id] }),
        });
      await app.close();
    });
    it('matches the installed authentication library schema', () => {
      const tables = getAuthTables(app.get(AuthService).auth.options);
      for (const table of Object.values(tables)) {
        const model = Prisma.dmmf.datamodel.models.find(
          (item) => item.name.toLowerCase() === table.modelName.toLowerCase(),
        );
        expect(model).toBeDefined();
        for (const [name, field] of Object.entries(table.fields)) {
          const actual = model!.fields.find(
            (item) => item.name === (field.fieldName ?? name),
          );
          expect(actual, table.modelName + '.' + name).toBeDefined();
          const expected =
            field.type === 'date'
              ? 'DateTime'
              : field.type === 'boolean'
                ? 'Boolean'
                : field.type === 'number'
                  ? field.bigint
                    ? 'BigInt'
                    : 'Int'
                  : 'String';
          expect(actual!.type).toBe(expected);
          if (field.required) expect(actual!.isRequired).toBe(true);
        }
      }
    });
    it('rejects weak auth configuration and insecure production settings', () => {
      expect(() =>
        parseAuthEnvironment({
          ...process.env,
          BETTER_AUTH_SECRET: 'x'.repeat(32),
        }),
      ).toThrow('BETTER_AUTH_SECRET');
      expect(() =>
        parseAuthEnvironment({ ...process.env, NODE_ENV: 'production' }),
      ).toThrow();
    });
    it('requires email verification, hashes passwords, and prevents duplicate accounts', async () => {
      const email = 'unverified-' + suffix + '@example.invalid';
      await post('/api/auth/sign-up/email', {
        name: 'Unverified',
        email,
        password,
        emailVerified: true,
        callbackURL: origin + '/login',
      }).expect(200);
      const user = await db.user.findUniqueOrThrow({ where: { email } });
      userIds.push(user.id);
      expect(user.emailVerified).toBe(false);
      const stored = await db.account.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(stored.password).not.toBe(password);
      expect(stored.password!.length).toBeGreaterThan(40);
      await post('/api/auth/sign-in/email', { email, password }).expect(403);
      await post('/api/auth/sign-up/email', {
        name: 'Duplicate',
        email,
        password,
      }).expect(200);
      expect(await db.user.count({ where: { email } })).toBe(1);
      await get('/workspaces').expect(401);
      const expired = await signJWT(
        { email },
        process.env.BETTER_AUTH_SECRET!,
        -10,
      );
      const response = await get(
        '/api/auth/verify-email?token=' +
          expired +
          '&callbackURL=' +
          encodeURIComponent(origin + '/login'),
      ).expect(302);
      expect(response.headers.location).toContain('error=');
      expect(
        (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
      ).toBe(false);
      await post('/api/auth/send-verification-email', {
        email,
        callbackURL: origin + '/login',
      }).expect(200);
      const url = await emailLink(email, 'Verify your Graqivo email');
      await get(url.pathname + url.search).expect(302);
      expect(
        (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
      ).toBe(true);
    });
    it('registers and verifies four independent test accounts using SMTP mail', async () => {
      ownerA = await account('Owner-A');
      ownerB = await account('Owner-B');
      admin = await account('Admin');
      member = await account('Member');
    });
    it('creates two isolated organizations and transactional Owner memberships', async () => {
      const first = await post(
        '/workspaces',
        {
          name: 'Test organization A',
          slug: 'test-a-' + suffix,
          workspaceType: 'ORGANIZATION',
        },
        ownerA.cookie,
      ).expect(201);
      const second = await post(
        '/workspaces',
        {
          name: 'Test organization B',
          slug: 'test-b-' + suffix,
          workspaceType: 'ORGANIZATION',
        },
        ownerB.cookie,
      ).expect(201);
      orgA = first.body;
      orgB = second.body;
      organizationIds.push(orgA.id, orgB.id);
      expect(
        (
          await db.organizationMembership.findUniqueOrThrow({
            where: {
              organizationId_userId: {
                organizationId: orgA.id,
                userId: ownerA.id,
              },
            },
          })
        ).role,
      ).toBe('OWNER');
      await post(
        '/workspaces',
        { name: 'Duplicate', slug: orgA.slug, workspaceType: 'ORGANIZATION' },
        ownerA.cookie,
      ).expect(409);
      expect(
        await db.organizationMembership.count({
          where: { organizationId: orgA.id },
        }),
      ).toBe(1);
      await post(
        '/workspaces',
        {
          name: 'Injected role',
          slug: 'injected-' + suffix,
          workspaceType: 'ORGANIZATION',
          role: 'OWNER',
        },
        member.cookie,
      ).expect(400);
      await post(
        '/workspaces',
        { name: 'Bad slug', slug: '../other', workspaceType: 'ORGANIZATION' },
        member.cookie,
      ).expect(400);
    });
    it('creates a personal workspace without company information', async () => {
      const response = await post(
        '/workspaces',
        {
          name: 'Personal workspace',
          slug: 'personal-' + suffix,
          workspaceType: 'PERSONAL',
        },
        member.cookie,
      ).expect(201);
      organizationIds.push(response.body.id);
      expect(response.body.workspaceType).toBe('PERSONAL');
      await post(
        '/workspaces/' + response.body.slug + '/invitations',
        { email: ownerB.email, role: 'MEMBER' },
        member.cookie,
      ).expect(400);
    });
    it('denies direct cross-tenant reads and writes by slug', async () => {
      for (const path of [
        '/workspaces/' + orgA.slug,
        '/workspaces/' + orgA.slug + '/members',
        '/workspaces/' + orgA.slug + '/invitations',
      ])
        await get(path, ownerB.cookie).expect(403);
      await post(
        '/workspaces/' + orgA.slug + '/invitations',
        { email: admin.email, role: 'ADMIN' },
        ownerB.cookie,
      ).expect(403);
      const listed = await get('/workspaces', ownerB.cookie).expect(200);
      expect(
        listed.body.map(
          (item: { organization: { id: string } }) => item.organization.id,
        ),
      ).toEqual([orgB.id]);
    });
    it('rejects CSRF attempts, missing origins, and form submissions', async () => {
      const body = {
        name: 'CSRF',
        slug: 'csrf-' + suffix,
        workspaceType: 'ORGANIZATION',
      };
      await request(app.getHttpServer())
        .post('/workspaces')
        .set('Cookie', ownerA.cookie)
        .set('Origin', 'https://attacker.invalid')
        .send(body)
        .expect(403);
      await request(app.getHttpServer())
        .post('/workspaces')
        .set('Cookie', ownerA.cookie)
        .send(body)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set('Cookie', ownerA.cookie)
        .set('Origin', 'https://attacker.invalid')
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post('/workspaces')
        .set('Origin', origin)
        .set('Cookie', ownerA.cookie)
        .type('form')
        .send(body)
        .expect(403);
      await get('/me', ownerA.cookie).expect(200);
    });
    it('sends hashed invitations, enforces recipient identity, and prevents replay', async () => {
      const invitation = await invite(ownerA, orgA.slug, admin, 'ADMIN');
      const stored = await db.invitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      expect(stored.tokenHash).toBe(
        createHash('sha256').update(invitation.token).digest('hex'),
      );
      expect(JSON.stringify(invitation.body)).not.toContain(invitation.token);
      expect(invitation.body).not.toHaveProperty('tokenHash');
      await post(
        '/invitations/accept',
        { token: invitation.token },
        ownerB.cookie,
      ).expect(403);
      await post(
        '/invitations/accept',
        { token: invitation.token },
        admin.cookie,
      ).expect(201);
      await post(
        '/invitations/accept',
        { token: invitation.token },
        admin.cookie,
      ).expect(400);
      const membership = await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: orgA.id, userId: admin.id },
        },
      });
      expect(membership.role).toBe('ADMIN');
      expect(await db.user.count({ where: { email: admin.email } })).toBe(1);
    });
    it('allows Admin invitations and multiple-workspace membership', async () => {
      const invitation = await invite(admin, orgA.slug, member);
      await post(
        '/invitations/accept',
        { token: invitation.token },
        member.cookie,
      ).expect(201);
      const response = await get('/workspaces', member.cookie).expect(200);
      expect(response.body).toHaveLength(2);
      await get('/workspaces/' + orgA.slug, member.cookie).expect(200);
      await get('/workspaces/' + orgB.slug, member.cookie).expect(403);
    });
    it('denies Member administration and Admin ownership changes', async () => {
      const owner = await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: orgA.id, userId: ownerA.id },
        },
      });
      await get(
        '/workspaces/' + orgA.slug + '/invitations',
        member.cookie,
      ).expect(403);
      await post(
        '/workspaces/' + orgA.slug + '/invitations',
        { email: ownerB.email, role: 'ADMIN' },
        member.cookie,
      ).expect(403);
      await mutate(
        'patch',
        '/workspaces/' + orgA.slug + '/members/' + owner.id + '/role',
        { role: 'MEMBER' },
        admin.cookie,
      ).expect(403);
      await mutate(
        'delete',
        '/workspaces/' + orgA.slug + '/members/' + owner.id,
        {},
        admin.cookie,
      ).expect(403);
      await post(
        '/workspaces/' + orgA.slug + '/invitations',
        { email: ownerB.email, role: 'OWNER' },
        ownerA.cookie,
      ).expect(400);
      await mutate(
        'patch',
        '/workspaces/' + orgA.slug + '/members/' + owner.id + '/role',
        { role: 'MEMBER' },
        ownerA.cookie,
      ).expect(409);
      await mutate(
        'delete',
        '/workspaces/' + orgA.slug + '/members/' + owner.id,
        {},
        ownerA.cookie,
      ).expect(409);
    });
    it('denies manipulated membership and invitation IDs across tenants', async () => {
      const other = await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: orgB.id, userId: ownerB.id },
        },
      });
      await mutate(
        'patch',
        '/workspaces/' + orgA.slug + '/members/' + other.id + '/role',
        { role: 'MEMBER' },
        ownerA.cookie,
      ).expect(404);
      await mutate(
        'delete',
        '/workspaces/' + orgA.slug + '/members/' + other.id,
        {},
        ownerA.cookie,
      ).expect(404);
      const invitation = await invite(ownerB, orgB.slug, admin);
      await mutate(
        'delete',
        '/workspaces/' + orgA.slug + '/invitations/' + invitation.id,
        {},
        ownerA.cookie,
      ).expect(404);
      expect(
        (
          await db.invitation.findUniqueOrThrow({
            where: { id: invitation.id },
          })
        ).status,
      ).toBe('PENDING');
    });
    it('rejects expired and revoked invitations', async () => {
      const expired = await invite(ownerA, orgA.slug, ownerB);
      await db.invitation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await post(
        '/invitations/accept',
        { token: expired.token },
        ownerB.cookie,
      ).expect(400);
      const revoked = await invite(ownerA, orgA.slug, ownerB);
      await mutate(
        'delete',
        '/workspaces/' + orgA.slug + '/invitations/' + revoked.id,
        {},
        ownerA.cookie,
      ).expect(200);
      await post(
        '/invitations/accept',
        { token: revoked.token },
        ownerB.cookie,
      ).expect(400);
      expect(
        await db.organizationMembership.count({
          where: { organizationId: orgA.id, userId: ownerB.id },
        }),
      ).toBe(0);
    });
    it('immediately removes revoked membership from reads and workspace switching', async () => {
      const membership = await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: orgA.id, userId: member.id },
        },
      });
      await mutate(
        'delete',
        '/workspaces/' + orgA.slug + '/members/' + membership.id,
        {},
        ownerA.cookie,
      ).expect(200);
      await get('/workspaces/' + orgA.slug, member.cookie).expect(403);
      await get('/workspaces/' + orgA.slug + '/members', member.cookie).expect(
        403,
      );
      const response = await get('/workspaces', member.cookie).expect(200);
      expect(
        response.body.map(
          (item: { organization: { id: string } }) => item.organization.id,
        ),
      ).not.toContain(orgA.id);
      const invitation = await invite(ownerA, orgA.slug, member);
      await post(
        '/invitations/accept',
        { token: invitation.token },
        member.cookie,
      ).expect(201);
      expect(
        await db.organizationMembership.count({
          where: { organizationId: orgA.id, userId: member.id },
        }),
      ).toBe(1);
      await get('/workspaces/' + orgA.slug, member.cookie).expect(200);
    });
    it('retains an Owner under concurrent ownership changes', async () => {
      const first = await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: orgA.id, userId: ownerA.id },
        },
      });
      const second = await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: orgA.id, userId: admin.id },
        },
      });
      await mutate(
        'patch',
        '/workspaces/' + orgA.slug + '/members/' + second.id + '/role',
        { role: 'OWNER' },
        ownerA.cookie,
      ).expect(200);
      const responses = await Promise.all([
        mutate(
          'patch',
          '/workspaces/' + orgA.slug + '/members/' + first.id + '/role',
          { role: 'MEMBER' },
          ownerA.cookie,
        ),
        mutate(
          'patch',
          '/workspaces/' + orgA.slug + '/members/' + second.id + '/role',
          { role: 'MEMBER' },
          admin.cookie,
        ),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const owner = await db.organizationMembership.findFirstOrThrow({
        where: { organizationId: orgA.id, role: 'OWNER', status: 'ACTIVE' },
      });
      expect(
        await db.organizationMembership.count({
          where: { organizationId: orgA.id, role: 'OWNER', status: 'ACTIVE' },
        }),
      ).toBe(1);
      const cookie = owner.userId === ownerA.id ? ownerA.cookie : admin.cookie;
      await mutate(
        'patch',
        '/workspaces/' + orgA.slug + '/members/' + first.id + '/role',
        { role: 'OWNER' },
        cookie,
      ).expect(200);
      await mutate(
        'patch',
        '/workspaces/' + orgA.slug + '/members/' + second.id + '/role',
        { role: 'ADMIN' },
        ownerA.cookie,
      ).expect(200);
    });
    it('creates a new session on login and rejects expired and signed-out cookies', async () => {
      const first = await signIn(ownerB.email);
      const second = await signIn(ownerB.email);
      expect(first).not.toBe(second);
      await post('/api/auth/sign-out', {}, first).expect(200);
      await get('/me', first).expect(401);
      await get('/me', second).expect(200);
      await db.session.updateMany({
        where: { userId: ownerB.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await get('/me', second).expect(401);
    });
    it('resets passwords through email, revokes sessions, and prevents reset replay', async () => {
      const old = await signIn(member.email);
      const response = await post('/api/auth/request-password-reset', {
        email: member.email,
        redirectTo: origin + '/reset-password',
      }).expect(200);
      const absent = await post('/api/auth/request-password-reset', {
        email: 'absent-' + suffix + '@example.invalid',
        redirectTo: origin + '/reset-password',
      }).expect(200);
      expect(absent.body).toEqual(response.body);
      const url = await emailLink(member.email, 'Reset your Graqivo password');
      expect(url.pathname).toBe('/reset-password');
      const token = new URLSearchParams(url.hash.slice(1)).get('token')!;
      const nextPassword = 'New-' + password;
      await post('/api/auth/reset-password', {
        token,
        newPassword: nextPassword,
      }).expect(200);
      await get('/me', old).expect(401);
      await post('/api/auth/reset-password', {
        token,
        newPassword: nextPassword,
      }).expect(400);
      await post('/api/auth/sign-in/email', {
        email: member.email,
        password,
      }).expect(401);
      expect(await signIn(member.email, nextPassword)).toBeTruthy();
    });
    it('records security and workspace changes without invitation tokens', async () => {
      const events = await db.auditEvent.findMany({
        where: { organizationId: orgA.id },
      });
      const actions = events.map((event) => event.action);
      for (const action of [
        'WORKSPACE_CREATED',
        'MEMBER_INVITED',
        'INVITATION_ACCEPTED',
        'MEMBERSHIP_ROLE_CHANGED',
        'MEMBERSHIP_REVOKED',
      ])
        expect(actions).toContain(action);
      expect(JSON.stringify(events)).not.toContain(password);
      const queued = await db.emailOutbox.findMany({
        where: { status: 'PENDING' },
      });
      expect(
        queued.every(
          (job) =>
            !job.payload.includes('http') &&
            !job.payload.includes('@example.invalid'),
        ),
      ).toBe(true);
    });
    it('rejects foreign auth redirects and callback URLs', async () => {
      await post('/api/auth/request-password-reset', {
        email: ownerA.email,
        redirectTo: 'https://attacker.invalid/reset',
      }).expect(403);
      await post('/api/auth/sign-in/email', {
        email: ownerA.email,
        password,
        callbackURL: 'https://attacker.invalid/callback',
      }).expect(403);
    });
    it('invalidates replaced invitations and rejects mismatched inviter foreign keys', async () => {
      ownerB.cookie = await signIn(ownerB.email);
      const old = await invite(ownerA, orgA.slug, ownerB);
      const replacement = await invite(ownerA, orgA.slug, ownerB);
      expect(replacement.token).not.toBe(old.token);
      expect(
        (await db.invitation.findUniqueOrThrow({ where: { id: old.id } }))
          .status,
      ).toBe('REVOKED');
      await post(
        '/invitations/accept',
        { token: old.token },
        ownerB.cookie,
      ).expect(400);
      await mutate(
        'delete',
        '/workspaces/' + orgA.slug + '/invitations/' + replacement.id,
        {},
        ownerA.cookie,
      ).expect(200);
      const foreign = await db.organizationMembership.findUniqueOrThrow({
        where: {
          organizationId_userId: { organizationId: orgB.id, userId: ownerB.id },
        },
      });
      await expect(
        db.invitation.create({
          data: {
            organizationId: orgA.id,
            invitedById: foreign.id,
            email: ownerB.email,
            role: 'MEMBER',
            tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
            expiresAt: new Date(Date.now() + 10000),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('rate-limits login even when attacker-supplied IP headers change', async () => {
      let limited = false;
      for (let attempt = 0; attempt < 25; attempt++) {
        const response = await post('/api/auth/sign-in/email', {
          email: ownerA.email,
          password: 'Wrong-password-123!',
        })
          .set('X-Forwarded-For', '192.0.2.' + attempt)
          .set('x-graqivo-client-ip', '192.0.2.' + attempt);
        if (response.status === 429) {
          limited = true;
          expect(Number(response.headers['x-retry-after'])).toBeGreaterThan(0);
          break;
        }
        expect(response.status).toBe(401);
      }
      expect(limited).toBe(true);
    });
  },
);
