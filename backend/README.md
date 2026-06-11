# Podcast Platform — Backend

NestJS 10 + Prisma 5 + BullMQ 5 + Socket.IO backend for the ISBN → AI Podcast platform.

## Local Development

### 1. Install dependencies

```bash
# From the repo root
pnpm install
```

### 2. Start infrastructure (Postgres / Redis / MinIO)

The backend depends on Postgres, Redis, and MinIO. The easiest way to bring
them up locally is via the docker-compose file at the repo root:

```bash
# From the repo root
docker compose up postgres redis minio -d
```

Wait for the health checks to pass (Postgres `pg_isready`, Redis `PING`,
MinIO `curl /minio/health/live`).

If you do not have Docker available, you can install equivalent services
natively:

| Service  | Local default            |
|----------|--------------------------|
| Postgres | `localhost:5432` (user `postgres`, password `postgres`, db `podcast`) |
| Redis    | `localhost:6379`         |
| MinIO    | `localhost:9000` (access `minioadmin`, secret `minioadmin`)         |

Update `backend/.env` (copy from `backend/.env.example` if present) to point
at your local services.

### 3. Run Prisma migration + seed

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate
pnpm seed:bgm   # optional, fills the 12 BGM tracks
```

### 4. Start the dev server

```bash
pnpm dev
# => NestJS listening on http://localhost:3001
```

## Testing

### Unit tests (`pnpm test`)

Runs Jest with `jest.config.ts` (ts-jest preset, `@shared/*` path mapping,
nanoid ESM transformed). **No external services required.**

```bash
cd backend
pnpm test
```

### E2E tests (`pnpm test:e2e`)

> **Prerequisite:** Before running e2e tests you MUST have Postgres, Redis,
> and MinIO available. The e2e suite (`test/auth.e2e-spec.ts`) hits the real
> `/api/auth/*` and `/api/projects/*` endpoints and therefore needs a live
> database.
>
> ```bash
> # From the repo root
> docker compose up postgres redis minio -d
> # wait for health checks
> cd backend
> pnpm prisma:migrate
> pnpm test:e2e
> ```
>
> If you cannot run Docker, the e2e suite will fail at `app.init()` because
> the Prisma client cannot connect to the database. In that environment,
> only run `pnpm test` (unit tests).

### Lint & build

```bash
cd backend
pnpm lint
pnpm build         # nest build → dist/backend/src/main.js
pnpm start:prod    # NODE_ENV=production node dist/backend/src/main.js
```

## Notes on individual test files

- `test/book-adapter.spec.ts` and `test/script-adapter.spec.ts` are pure
  unit tests that exercise the mock-fallback paths of the third-party
  adapters. No infrastructure needed.
- `test/mix.service.spec.ts` invokes `ffmpeg` with the `lavfi` (libavfilter)
  input format to synthesize a short MP3. On ffmpeg builds that were compiled
  without libavfilter, this test is **skipped** at runtime (it detects support
  via `ffmpeg -hide_banner -formats 2>&1 | grep -q lavfi`). The suite still
  reports as passing on lean ffmpeg builds.
- `test/auth.e2e-spec.ts` is the only true e2e test; it requires the full
  Docker stack as described above.
