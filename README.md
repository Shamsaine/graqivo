# Graqivo
Your work, connected. An independently owned Next.js / NestJS / PostgreSQL application by Alteturia Studios.

## Current checkpoint
Phase 1 foundation. The public introduction and development status page are available. Authentication, private workspaces, resource operations, and uploads are not implemented yet. No fictional workspace statistics or users are served.

## Verification status
The frontend and API are running locally. Frontend TypeScript validation passed; Prisma client generation and the database migration succeeded. All 7 foundation tests passed. Landing/status pages and API liveness/readiness endpoints returned HTTP 200.

Dependencies were installed separately in each app. The root dependency installation and monorepo lockfile remain pending. Production builds, API typecheck, lint/format checks, MinIO/Mailpit startup, and browser visual QA are still unverified. Phases 2–8 are not implemented.

## Current local preview
- Frontend: http://127.0.0.1:3000
- Development status: http://127.0.0.1:3000/welcome
- API readiness: http://127.0.0.1:4000/health/ready

Both development servers were left running. To restart with the current separate app installs, use two terminals:
```text
npm run dev -w @graqivo/web -- --hostname 127.0.0.1
npm run dev -w @graqivo/api
```
The single root `npm run dev` command requires the root tooling installation to finish first.

## Local setup
Requires Node.js 22.12+, npm, and a running Docker engine.
1. Run `npm install`.
2. Copy `.env.example` to `.env`; set unique local PostgreSQL and MinIO passwords.
3. Copy `apps/api/.env.example` to `apps/api/.env`; match the passwords above (URL-encode the database password). Copy `apps/web/.env.example` to `apps/web/.env.local`.
4. Run `npm run infra:up`.
5. Run `npm run db:generate` and `npm run db:migrate`.
6. Run `npm run dev`.

Web: http://localhost:3000 · API liveness: http://localhost:4000/health · Database readiness: http://localhost:4000/health/ready · Mailpit: http://localhost:8025 · MinIO console: http://localhost:9011.

This checkout has generated local credentials in ignored environment files. Keep those files to retain access to the running database; the example-copy steps are for a fresh setup.

Local ports bind to loopback. Compose volumes persist data. `npm run infra:down` retains volumes. No MinIO bucket is public; bucket provisioning is part of Phase 4.

## Quality checks
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run format:check`.
Run `npm run test:database -w @graqivo/api` after applying migrations for a real database constraint test. HTTP tests use a database dependency stub; they do not prove PostgreSQL connectivity or tenant isolation. Readiness must also be checked with the real database.

## Development record
See [architecture](docs/architecture/PLAN.md), [credentials](docs/deployment/CREDENTIALS_SETUP.md), and [checkpoint record](docs/PROGRESS.md). Hosted deployment is deferred until the security and acceptance checkpoints pass.

The default PostgreSQL host port is 55439 (configurable with POSTGRES_PORT). MinIO API/console use 9010/9011 to avoid common local conflicts.
