# Graqivo

Your work, connected. An independently owned Next.js / NestJS / PostgreSQL application by Alteturia Studios.

## Current checkpoint

Phase 5 adds assigned review requests, comments, approvals, change requests, permanent review history and authorized activity feeds. Resource/project pages, People and the dashboard show current scoped activity and review attention. Final visual refinement and hosted deployment belong to later phases.

## Local preview

- App: http://127.0.0.1:3000/register
- Sign in: http://127.0.0.1:3000/login
- Local email inbox: http://127.0.0.1:8025
- API readiness: http://127.0.0.1:4000/health/ready

Create an account, open its verification email in Mailpit, then sign in and create a workspace. Organization Owners and Admins can invite people from the workspace administration page. Recipients must sign in with their verified invited address and reopen the invitation email. Personal workspaces do not require company information and do not support invitations.

## Setup

Requires Node.js 22.12+, npm, and a running Docker engine.

1. Run `npm ci --legacy-peer-deps`. The root lockfile is authoritative. The flag avoids unused framework integration peer conflicts in Better Auth; Nest integration is tested separately.
2. Copy `.env.example` to `.env` and generate unique PostgreSQL and local storage passwords.
3. Copy `apps/api/.env.example` to `apps/api/.env`. Match PostgreSQL credentials, URL-encode passwords, set a cryptographically random `BETTER_AUTH_SECRET` of at least 32 characters, and set local `EMAIL_FROM_ADDRESS=no-reply@graqivo.local`.
4. Match API `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` to root `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` (legacy names used by local IAM generation). Copy `apps/web/.env.example` to `apps/web/.env.local`.
5. Run `npm run storage:local-config`, then `npm run infra:up`, `npm run storage:init`, `npm run db:generate`, and `npm run db:migrate`.
6. Run `npm run dev`.

This checkout already has generated credentials in ignored environment files. Retain those files to access its existing database. Never commit them.

Local ports: web 3000, API 4000, PostgreSQL 55439, SMTP 1025, Mailpit 8025, private S3 storage 9010. Frontend/API origins must match the configured allowlist; localhost and 127.0.0.1 are both allowed in this checkout. Cookie tokens are never stored in browser local storage. Compose volumes persist across `npm run infra:down`.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:database`, `npm run build`, and `npm run format:check`.

For authentication integration tests, create the separate `graqivo_test` database, set `TEST_DATABASE_URL` in the API environment, and apply the same migrations to it. With Compose:

```text
docker compose exec -T postgres createdb -U graqivo graqivo_test
```

For its migration, temporarily set `DATABASE_URL` in the shell to the test database URL and run `npm run db:migrate`; then unset that shell override. Tests refuse any database name except graqivo_test and never fall back to the application's database. They require local Mailpit SMTP and its HTTP API on port 8025. Run `npm run test:phase2`, `npm run test:phase3`, `npm run test:phase4`, `npm run test:phase5`, and `npm run test:email -w @graqivo/api` sequentially. Phase 4 tests also require the authenticated S3 service; they use a separate graqivo-test bucket.

Actual verification: all 82 tests passed (21 Phase 5, 18 Phase 4, 13 Phase 3, 21 Phase 2, six foundation, one database, two email queue). API/frontend typechecks, lint and production builds passed. Browser visual/interaction QA could not run because no browser session is available.

## Security and deployment boundaries

Authorization reads current session and membership state from PostgreSQL on every protected request. Tenant IDs and roles supplied by clients do not grant access. Invitations store only token hashes; queued email payloads are encrypted and cleared on delivery. Transactional membership changes preserve at least one Owner, including concurrent requests. SMTP delivery retries persisted jobs. Audit events have no client write API.

Production requires HTTPS, secure cookies, and authenticated TLS SMTP. Hosted frontend/API must share a site or use a reverse proxy for SameSite cookies. Proxy trust and rate-limit identity configuration remain part of Phase 7; the local API uses socket addresses and ignores spoofable client proxy headers. Drain queued mail before rotating its encryption/auth secret. Google OAuth and a Resend API adapter remain optional and are not enabled.

Local storage uses authenticated SeaweedFS through the S3 adapter because MinIO distributions were unavailable. MinIO and Cloudflare R2 adapters remain supported; hosted R2 has not been exercised. Files stay private, and downloads require current authorization before issuing attachment URLs (120 seconds by default). An already issued URL remains valid until expiration. Upload validation is not an antivirus scanner. See [Phase 4 record](docs/PHASE4.md) for behavior and limits.

See [Phase 5 review/activity record](docs/PHASE5.md), [architecture](docs/architecture/PLAN.md), [credentials](docs/deployment/CREDENTIALS_SETUP.md), and [development record](docs/PROGRESS.md). Hosted deployment and the complete V1 pilot are not complete.

copyrighted
