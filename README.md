# Graqivo

Your work, connected. An independently owned Next.js / NestJS / PostgreSQL application by Alteturia Studios.

## Current checkpoint

Phase 2 implements verified email/password accounts, password reset, database-backed sessions, personal and organization workspaces, Owner/Admin/Member roles, invitations, workspace switching, and server-enforced tenant isolation. Projects, resources, uploads, reviews, and hosted deployment belong to later phases.

## Local preview

- App: http://127.0.0.1:3000/register
- Sign in: http://127.0.0.1:3000/login
- Local email inbox: http://127.0.0.1:8025
- API readiness: http://127.0.0.1:4000/health/ready

Create an account, open its verification email in Mailpit, then sign in and create a workspace. Organization Owners and Admins can invite people from the workspace administration page. Recipients must sign in with their verified invited address and reopen the invitation email. Personal workspaces do not require company information and do not support invitations.

## Setup

Requires Node.js 22.12+, npm, and a running Docker engine.

1. Run `npm ci --legacy-peer-deps`. The root lockfile is authoritative. The flag avoids unused framework integration peer conflicts in Better Auth; Nest integration is tested separately.
2. Copy `.env.example` to `.env` and generate unique PostgreSQL and MinIO passwords.
3. Copy `apps/api/.env.example` to `apps/api/.env`. Match PostgreSQL credentials, URL-encode passwords, set a cryptographically random `BETTER_AUTH_SECRET` of at least 32 characters, and set local `EMAIL_FROM_ADDRESS=no-reply@graqivo.local`.
4. Copy `apps/web/.env.example` to `apps/web/.env.local`.
5. Run `npm run infra:up`, `npm run db:generate`, and `npm run db:migrate`.
6. Run `npm run dev`.

This checkout already has generated credentials in ignored environment files. Retain those files to access its existing database. Never commit them.

Local ports: web 3000, API 4000, PostgreSQL 55439, SMTP 1025, Mailpit 8025, MinIO 9010/9011. Frontend/API origins must match the configured allowlist; localhost and 127.0.0.1 are both allowed in this checkout. Cookie tokens are never stored in browser local storage. Compose volumes persist across `npm run infra:down`.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:database`, `npm run build`, and `npm run format:check`.

For authentication integration tests, create the separate `graqivo_test` database, set `TEST_DATABASE_URL` in the API environment, and apply the same migrations to it. With Compose:

```text
docker compose exec -T postgres createdb -U graqivo graqivo_test
```

For its migration, temporarily set `DATABASE_URL` in the shell to the test database URL and run `npm run db:migrate`; then unset that shell override. Tests refuse any database name except graqivo_test and never fall back to the application's database. They require local Mailpit SMTP and its HTTP API on port 8025. Run `npm run test:phase2` and then `npm run test:email -w @graqivo/api` sequentially.

Actual verification: API/frontend typechecks, lint, production builds, six foundation tests, one database test, and two email queue tests passed. All 21 authentication and tenant integration tests passed (30 tests total). All eleven frontend routes returned HTTP 200 on the production server. Browser visual/interaction QA could not run because no browser session is available.

## Security and deployment boundaries

Authorization reads current session and membership state from PostgreSQL on every protected request. Tenant IDs and roles supplied by clients do not grant access. Invitations store only token hashes; queued email payloads are encrypted and cleared on delivery. Transactional membership changes preserve at least one Owner, including concurrent requests. SMTP delivery retries persisted jobs. Audit events have no client write API.

Production requires HTTPS, secure cookies, and authenticated TLS SMTP. Hosted frontend/API must share a site or use a reverse proxy for SameSite cookies. Proxy trust and rate-limit identity configuration remain part of Phase 7; the local API uses socket addresses and ignores spoofable client proxy headers. Drain queued mail before rotating its encryption/auth secret. Google OAuth and a Resend API adapter remain optional and are not enabled.

See [architecture](docs/architecture/PLAN.md), [credentials](docs/deployment/CREDENTIALS_SETUP.md), and [development record](docs/PROGRESS.md). Hosted deployment and the complete V1 pilot are not complete.

copyrighted
