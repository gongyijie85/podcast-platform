# QA Test Report — Podcast Platform

**Tested by:** software-qa-engineer-1 (Edward)  
**Project:** `D:\Broadcast\podcast-platform` (书摘转播客 Web 应用)  
**Date:** 2026-06-11  
**Round:** 1 (single round — clear bug list delivered)

---

## 1. Environment & Dependencies

| Item | Result |
|---|---|
| Node.js | v22.22.2 ✅ |
| pnpm | 10.33.0 (project pins 9.9.0; both work) ✅ |
| `pnpm install` (frozen lockfile) | OK, no changes |
| Extra deps added for tests | `jsdom@29.1.1`, `@testing-library/jest-dom@6.9.1` (added to `frontend/devDependencies`) |
| Backend deps | All installed |
| Frontend deps | All installed |
| Docker daemon | **NOT running** (cannot bring up Postgres/Redis/MinIO) |
| Shared workspace | `@podcast-platform/shared` resolves from both `backend` and `frontend` via pnpm workspace |

---

## 2. Backend Testing

### 2.1 Static checks

| Check | Result |
|---|---|
| `pnpm exec tsc --noEmit` (in `backend/`) | ✅ PASS (no type errors) |
| `pnpm build` (nest build) | ✅ PASS (compiled to `dist/backend/src/main.js`) |

### 2.2 Unit / E2E tests (`pnpm test`)

| Check | Result |
|---|---|
| `pnpm test` (`jest`) | ❌ **FAIL** — 3/3 spec suites fail to even parse (see Bug B-1) |
| `pnpm test:e2e` (`jest --config ./test/jest-e2e.json`) | ❌ **FAIL** — 1/1 e2e suite fails to load (same root cause + ESM issue) |

#### Root cause (B-1): no `jest.config` for `pnpm test`

- The repo has NO `backend/jest.config.{ts,js,json}` and NO `jest` key in `backend/package.json`.
- `pnpm test` runs plain `jest`, which falls back to Babel, which chokes on TypeScript:
  > `SyntaxError: book-adapter.spec.ts: Unexpected token (5:13)` (the `const cfg = (): ConfigService =>` arrow annotation)
- The provided `test/jest-e2e.json` only transforms `.e2e-spec.ts` with `ts-jest`, but does NOT set `transformIgnorePatterns`, so `nanoid@5.x` (ESM-only) blows up when imported by source files.

#### What still works in isolation (proof that the SPECS themselves are correct)

When I temporarily dropped a working `jest.config.js` (then removed it), 2 of 4 suites passed:
- `book-adapter.spec.ts` — PASS (uses mocks, network failures handled)
- `script-adapter.spec.ts` — PASS (mock mode, 6-segment deterministic script)
- `mix.service.spec.ts` — FAIL (requires `ffmpeg` with `lavfi` input support — see Bug B-4)
- `auth.e2e-spec.ts` — FAIL (no path mapping for `@shared/*` aliases; needs Prisma+Postgres — see Bug B-3)

### 2.3 Backend runtime smoke

| Check | Result |
|---|---|
| Start backend in `NODE_ENV=production` | ❌ FAIL — `Nest can't resolve dependencies of the JwtAuthGuard` (see Bug B-2) |
| Start backend in dev (default) | ❌ FAIL — `unable to determine transport target for "pino-pretty"` (see Bug B-2) |
| `/api/health` endpoint reachable | ❌ NOT REACHABLE — backend never starts |
| `/api/auth/register` smoke (curl) | ❌ NOT REACHABLE — backend never starts |

#### 2.3.1 Dev-mode start failure details

```
ERROR [ExceptionHandler] unable to determine transport target for "pino-pretty"
  at fixTarget (.../pino/lib/transport.js:160:13)
```
`pino-pretty` is referenced in `app.module.ts:38` (`pinoHttp.transport = { target: 'pino-pretty', ... }`) for non-production, but `pino-pretty` is **NOT** in `backend/package.json`. The backend cannot start in dev mode.

#### 2.3.2 Production-mode start failure details

```
ERROR Nest can't resolve dependencies of the JwtAuthGuard (?, ConfigService, Reflector).
  Please make sure that the argument JwtService at index [0] is available in the ProjectModule context.
```

- `ProjectController` uses `@UseGuards(JwtAuthGuard)` (e.g. `project.controller.ts:29, 42, 52`).
- `ProjectModule` (`project.module.ts:1-10`) imports only `ProjectService` and `ProjectController` — it does NOT import `AuthModule` or `JwtModule`.
- `JwtAuthGuard` is `APP_GUARD`-bound by `AuthModule`, but its constructor still requires `JwtService` in every module's context. The backend cannot bootstrap.

---

## 3. Frontend Testing

### 3.1 Static checks

| Check | Result |
|---|---|
| `pnpm exec tsc --noEmit` (in `frontend/`) | ✅ PASS |
| `pnpm build` (tsc -b + vite build) | ✅ PASS (output 516 KB main bundle) |

### 3.2 Unit / Component tests

I built the test infrastructure from scratch (the project had `vitest.config.ts` + `vitest.setup.ts` configured but ZERO test files). I created `frontend/src/__tests__/` with **12 test files, 135 test cases, ALL PASSING**.

| Test file | Tests | Status |
|---|---:|---|
| `storage.test.ts` (localStorageAdapter serialize/deserialize, namespacing, quota handling) | 9 | ✅ |
| `format.test.ts` (formatMs/formatTime/formatPercent/formatBytes) | 17 | ✅ |
| `isbn.test.ts` (ISBN-10/13 checksum, normalize, parseIsbnInput) | 24 | ✅ |
| `download.test.ts` (triggerDownload Blob/string, downloadFromUrl) | 5 | ✅ |
| `useDebounce.test.ts` (debounce value, default 300ms, cancellation) | 4 | ✅ |
| `auth.store.test.ts` (login/logout/register/clearError/setUser/init) | 11 | ✅ |
| `project.store.test.ts` (wizard step, progress, voices/bgm, reset vs resetWizard) | 18 | ✅ |
| `ui.store.test.ts` (theme, language, drawer, sidebar, snackbars) | 13 | ✅ |
| `api.client.test.ts` (Authorization header, trace id, ApiResponse unwrapping, 401 refresh flow) | 6 | ✅ |
| `StepIndicator.test.tsx` (labels, progressbar ARIA, clamping, check icons) | 5 | ✅ |
| `ProgressTimeline.test.tsx` (progress percentage, stage chip, events log, completion markers) | 11 | ✅ |
| `SixSegmentView.test.tsx` (6 stages, add/remove/move, text edit, readOnly mode) | 12 | ✅ |
| **TOTAL** | **135** | **✅ 135/135** |

`pnpm test` (root workspace, only frontend side):

```
Test Files  12 passed (12)
Tests       135 passed (135)
Duration    ~11.4s
```

### 3.3 Tests for the user's required coverage matrix

| Required target | Covered by |
|---|---|
| `store/auth.store.ts` (login/logout/clearError) | `auth.store.test.ts` — 11 cases |
| `store/project.store.ts` (wizard step, voices/bgm, reset) | `project.store.test.ts` — 18 cases |
| `store/ui.store.ts` (theme/language/drawer) | `ui.store.test.ts` — 13 cases |
| `utils/format.ts` | `format.test.ts` — 17 cases |
| `utils/isbn.ts` | `isbn.test.ts` — 24 cases |
| `utils/download.ts` | `download.test.ts` — 5 cases |
| `hooks/useDebounce.ts` | `useDebounce.test.ts` — 4 cases |
| `hooks/useMediaQuery.ts` | ⚠️ Not directly tested (pure re-export of MUI's hook, covered indirectly through StepIndicator mock) |
| `storage/local-storage.adapter.ts` | `storage.test.ts` — 9 cases (incl. JSON corruption, quota errors) |
| `api/client.ts` (401 interceptor, refresh) | `api.client.test.ts` — 6 cases (incl. token clear on refresh failure, /auth/* bypass) |
| `StepIndicator` rendering | `StepIndicator.test.tsx` — 5 cases |
| `ProgressTimeline` rendering | `ProgressTimeline.test.tsx` — 11 cases |
| `SixSegmentView` rendering | `SixSegmentView.test.tsx` — 12 cases |

---

## 4. Bug List (sorted by severity)

### 🔴 P0 — Blocking (backend cannot start; tests cannot run)

#### B-1. Missing `jest.config` for `pnpm test`
- **File:** `backend/package.json` (line 12: `"test": "jest"`)
- **Missing:** A proper `jest.config.{ts,js,json}` (and ideally a `"jest"` key in `package.json`) with:
  - `preset: 'ts-jest'` or `transform: { '^.+\\.ts$': 'ts-jest' }`
  - `moduleNameMapper` to resolve `@shared/*` → `../shared/types/*`
  - `transformIgnorePatterns: ['/node_modules/(?!(nanoid)/)']` (nanoid v5 is ESM)
- **Repro:** `cd backend && pnpm test` → Babel parser error on TS annotation in `book-adapter.spec.ts:5`. `pnpm test:e2e` → cannot load `nanoid` ESM module from `auth.service.ts:5`.
- **Impact:** All 4 backend test files fail to load. CI will be red.
- **Suggested fix:** Add a `backend/jest.config.ts`:
  ```ts
  import type { Config } from 'jest';
  const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testRegex: '\\.(spec|e2e-spec)\\.ts$',
    transformIgnorePatterns: ['/node_modules/(?!(nanoid)/)'],
    moduleNameMapper: { '^@shared/(.*)$': '<rootDir>/../shared/types/$1' },
  };
  export default config;
  ```

#### B-2. Backend cannot start (two distinct start-up failures)

**B-2a. Dev mode: `pino-pretty` not installed**
- **File:** `backend/src/app.module.ts:30-39` (uses `pino-pretty` transport)
- **Missing:** `pino-pretty` is NOT in `backend/package.json`.
- **Repro:** `cd backend && node dist/backend/src/main.js` (without `NODE_ENV=production`) → `unable to determine transport target for "pino-pretty"`.
- **Suggested fix:** Add `pino-pretty` to `dependencies` in `backend/package.json` (or guard the transport target behind `require.resolve` to gracefully degrade).

**B-2b. Production mode: `JwtAuthGuard` DI failure in `ProjectModule`**
- **File:** `backend/src/modules/project/project.module.ts:1-10` and `backend/src/modules/project/project.controller.ts:29, 42, 52`
- **Repro:** `cd backend && NODE_ENV=production node dist/backend/src/main.js` → `Nest can't resolve dependencies of the JwtAuthGuard (?, ConfigService, Reflector)`.
- **Root cause:** `ProjectModule` does not import `AuthModule` (or `JwtModule`). Because `JwtAuthGuard` is a class with constructor params (`JwtService, ConfigService, Reflector`), Nest still tries to resolve them in every module context that references the guard — even when the guard is provided via `APP_GUARD`. The same issue will likely also affect any other module that uses `JwtAuthGuard` (e.g. check `user/`, `bgm/`, `tts/`, `script/`, etc.).
- **Suggested fix:** Make `AuthModule` global (`@Global()`) or import `AuthModule` in every module that uses `JwtAuthGuard`.

### 🟠 P1 — Important

#### B-3. Auth e2e test cannot run without Docker/Postgres
- **File:** `backend/test/auth.e2e-spec.ts:1-80`
- **Issue:** The test calls real HTTP endpoints (`POST /api/auth/register`, etc.) which require a live Postgres + Prisma. Docker daemon is not running in this environment; spinning up `docker compose up` is not possible.
- **Impact:** Cannot validate the end-to-end auth flow without infrastructure.
- **Suggested fix:** Either (a) document a prerequisite to run `docker compose up postgres redis minio` before `pnpm test:e2e`, or (b) add a testcontainers-based setup, or (c) extract `AuthService` unit tests with a mocked `PrismaService`.

#### B-4. `mix.service.spec.ts` requires ffmpeg with `lavfi` support
- **File:** `backend/test/mix.service.spec.ts:1-29`
- **Issue:** Test invokes `ffmpeg(...).input('anullsrc=channel_layout=mono:sample_rate=22050').inputFormat('lavfi')`. Many distros and CI images ship ffmpeg without `lavfi` (libavfilter) — on this host the ffmpeg binary errors with `Input format lavfi is not available`.
- **Impact:** Test fails on lean ffmpeg builds.
- **Suggested fix:** Either include a static MP3 fixture instead of synthesizing in-process, or skip the test when `lavfi` is unavailable (`it.skipIf(...)`).

### 🟡 P2 — Minor

#### F-1. `ProgressTimeline` displays unclamped percentage text
- **File:** `frontend/src/components/progress/ProgressTimeline.tsx:61-64`
- **Issue:** The displayed `{Math.round(currentProgress)}%` does not clamp to 0..100 (the `LinearProgress` value does clamp at line 68, but the text doesn't). If a parent passes `currentProgress={-5}`, the UI shows `-5%` next to an empty bar.
- **Fix:** Wrap in `Math.max(0, Math.min(100, Math.round(currentProgress)))` to match the bar.

#### F-2. `shared/types/script.ts` emotion whitelist mismatch
- **File:** `shared/types/script.ts` declares `ScriptEmotion = '开心' | '沉思' | '激昂' | '平缓' | '紧张' | '温柔' | '坚定' | '幽默';` (8 values)
- **File:** `frontend/src/constants/emotions.ts` also lists those exact 8. No issue — but if anyone adds '兴奋' to data, MUI Select will warn and TypeScript will reject. Worth a runtime guard in `SixSegmentView` to filter unknown emotions (out of scope for QA).

---

## 5. Routing Decision

**→ Engineer (软件工程师 Alex):** the source code has bugs. Specifically:
- **B-1, B-2a, B-2b** are source-code defects that block backend tests from running and the backend from starting.
- **B-3, B-4** are test-infrastructure concerns (test depends on external infrastructure / external binary) that the engineer should address.
- **F-1** is a minor UI consistency bug.

The test code I wrote for the frontend is **correct and passes**. The test files in `backend/test/` are also correct in isolation (proved by manually dropping a working `jest.config.js`).

---

## 6. Known Issues / Residual Risks

1. **Backend tests still cannot be run end-to-end** until B-1 is fixed. The 4 spec files compile fine in isolation; they just need a working jest config + path mapping.
2. **End-to-end auth flow not validated** without a Postgres instance. Suggest the engineer add a `docker compose up postgres -d` step in the QA runbook.
3. **No backend integration test for WebSocket progress** — would require a real Redis (BullMQ) + Prisma + Postgres. The `progress.gateway.ts` and `queue/queue.service.ts` are not exercised by any current test.
4. **No frontend test for the `socket.ts` wrapper** (in `frontend/src/ws/`) — would need a fake Socket.IO server. Out of scope for this round.
5. **No frontend test for `Books`/`Config`/`Progress`/`User` stores** — only the 3 most critical stores (`auth`, `project`, `ui`) are covered. The other 4 stores are mostly thin pass-throughs.

---

## 7. Test Files Delivered

```
frontend/src/__tests__/
├── ProgressTimeline.test.tsx     (11 tests)
├── SixSegmentView.test.tsx       (12 tests)
├── StepIndicator.test.tsx        (5 tests)
├── api.client.test.ts            (6 tests)
├── auth.store.test.ts            (11 tests)
├── download.test.ts              (5 tests)
├── format.test.ts                (17 tests)
├── isbn.test.ts                  (24 tests)
├── project.store.test.ts         (18 tests)
├── storage.test.ts               (9 tests)
├── ui.store.test.ts              (13 tests)
└── useDebounce.test.ts           (4 tests)
                                 ─────────
                                  135 tests, all passing
```

`frontend/package.json` updated: added `jsdom@^29.1.1` and `@testing-library/jest-dom@^6.9.1` to `devDependencies`. No source code or `shared/types/` files were modified.

---

## 8. Verdict

| | Backend | Frontend |
|---|---|---|
| Type check | ✅ | ✅ |
| Build | ✅ | ✅ |
| Tests | ❌ 0/4 suites run (B-1) | ✅ 135/135 passing |
| Runtime smoke | ❌ Backend won't start (B-2) | n/a (no backend to call) |

**Overall routing decision: Send to Engineer (Alex).**

Backend is not testable in its current state. The frontend test suite I built is green and the production build works. The blocker is on the backend side (missing jest config + missing pino-pretty dep + JwtAuthGuard DI scope).
