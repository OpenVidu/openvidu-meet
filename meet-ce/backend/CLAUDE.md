# Backend (`@openvidu-meet/backend`)

Node.js + Express 5 REST API in TypeScript. ESM (`"type": "module"`): every relative import needs an
explicit `.js` extension, even when the source file is `.ts`. Deliberately framework-light: no Nest,
no ORM beyond Mongoose. Dependencies: MongoDB (state), Redis (locks / ephemeral state),
LiveKit (media), and S3 / Azure Blob / GCS (recordings).

Entry point: `src/server.ts`. It also serves the built SPA and the webcomponent bundle out of
`public/` (generated, never edit).

What each endpoint does, who may call it and how it fails is specified in `openspec/specs/` (one
capability per feature, plus `deployment` for operator-facing behavior); this file covers how the
code is organized.

## Layers

`routes → middlewares → request-validators → controllers → services → repositories → MongoDB`

- **routes/**: one file per resource; composes auth, rate limit, validation and authorization
  middleware, then the controller. This is where the security posture of an endpoint is declared, so
  read the route before changing a controller.
- **middlewares/request-validators/**: Zod validation. Parsed output is written to
  `res.locals.validatedQuery`; controllers read that, **not** `req.query`.
- **controllers/**: thin. Resolve services from the container, log, call the service, shape the
  response, and funnel failures through `handleError(res, error, '<doing something>')`.
- **services/**: all business logic. `src/services/storage/` abstracts the blob providers behind
  `StorageProvider` + `StorageKeyBuilder`.
- **repositories/**: Mongoose access only. Concrete repos extend `BaseRepository<TDomain, TDocument>`
  and implement `toDomain()`; keep persistence-only fields out of the domain type.

## Public vs internal API

Two OpenAPI specs, two base paths (`src/config/internal-config.ts`):

- **Public** `/api/v1`: the documented, supported, backwards-compatible surface: `users`, `rooms`
  (incl. room members), `meetings`, `recordings`, `webhooks`. Docs at `<basePath>/api/v1/docs`.
- **Internal** `/internal-api/v1`: consumed by our own frontend/webcomponent, no compatibility
  promise: `auth`, `api-keys`, `config`, `analytics`, `ai`, plus internal room/user
  routes. Docs only served in `NODE_ENV=development`.

Some routers export both (`roomRouter` + `internalRoomRouter`). The OpenAPI under `openapi/` is the
wire contract: a change to an endpoint updates it in the same OpenSpec change that updates the
behavior. See `openapi/README.md` for the file layout; validate with `pnpm run lint:api` (Redocly)
before generating HTML.

## Authentication and authorization

`middlewares/auth.middleware.ts` composes `withAuth(...validators)`. Validators are sorted by
priority and only the ones whose credentials are *present* run; the first success passes, the first
present-but-invalid one rejects immediately:

1. `apiKeyValidator` (4): `x-api-key` header, service-to-service.
2. `roomMemberTokenValidator` (3): `x-room-member-token`, scoped to one room.
3. `accessTokenValidator(...roles)` (2): user JWT, `MeetUserRole` = `admin` | `room_manager` | `room_member`.
4. `allowAnonymous` (1).

Tokens are Bearer headers, never cookies; `accessToken` / `roomMemberToken` may also arrive as query
params (`utils/token.utils.ts`) because `<video>` requests cannot set headers.

Tokens carry an `iat` that is compared against `user.roleUpdatedAt`, `room.rolesUpdatedAt` and
`roomMember.permissionsUpdatedAt`: bumping one of those timestamps is how a permission change
invalidates live tokens. Keep that invariant when touching roles, room access or member permissions.

Coarse role checks happen in `withAuth`; fine-grained checks live in `room.middleware.ts` /
`room-member.middleware.ts` (`authorizeRoomAccess`, `authorizeRoomManagement`, …). Effective member
permissions (`MeetRoomMemberPermissions`) are also pushed into LiveKit grants, so a permission must
be enforced **both** at the API and in the token grant to be real.

## Permission naming migration (old names removed in 3.12.0)

The `permissions` spec states the contract (both key sets accepted and returned, `422` on a
conflicting pair, tokens normalized). The code rules behind it:

- `MEET_PERMISSION_ALIASES` in the typings package is the one place that maps each old name to its
  new name; never hardcode a pair anywhere else.
- Both key sets are serialized through `helpers/permission-naming.helper.ts`, shared by the REST
  controllers and `webhook-dispatcher.service.ts`. Several response paths bypass `applyFieldFilters`,
  so don't assume that helper already covers them.
- `recording.middleware.ts` checks three permissions (`recordingList`, `recordingPlay`,
  `recordingDownload`) where the old `canRetrieveRecordings` was one.
- The database stores only the new names (migrations `room` v3→v4, `roomMember` v1→v2). A new
  permission goes into `MEET_PERMISSION_KEYS` too: Mongoose silently drops any key it doesn't
  recognize, so a missed entry reads as `false` instead of raising an error. It also needs a
  migration **step of its own** that re-runs the permission normalization (`room` v4→v5 and
  `roomMember` v2→v3 for `participantMute`, v5→v6 / v3→v4 for `participantHandLower`, v6→v7 / v4→v5
  for `participantReactionSend`): documents already at the previous version are up to date as far as
  the runner is concerned, so extending the previous step would never reach them.
- Decoding a token normalizes old names through the same `MeetPermissionsSchema` the API uses.

The plan behind it: `../openvidu-competitors/meet-update-plan/api-naming-migration-phase.md`.

## Cross-cutting infrastructure

- **DI (Inversify 8)**: `src/config/dependency-injector.config.ts`. Bindings are grouped in
  `ContainerModule`s and loaded in one order-independent `container.load(...)`; every binding is a
  lazy singleton. Injection is fully explicit `@inject(...)`: decorator metadata emission is **off**
  and there is no `reflect-metadata`, so a missing `@inject` fails at runtime. Break construction
  cycles with a lazy `container.get(...)` at the point of use, not with a constructor dependency.
  Startup work that must happen before listening goes in `initializeEagerServices()`.
- **Request context**: `initRequestContext` must stay the first middleware after body parsing; it
  opens the `AsyncLocalStorage` scope that `RequestSessionService` (authenticated user, room member
  token info) relies on. Anything outside a request (schedulers, webhooks) has no session.
- **Logging**: always `container.get(LoggerService)` (Winston). Request-id correlation is stamped at
  logger level, not in the transport formatter.
- **Errors**: `models/error.model.ts`: `OpenViduMeetError` factories (`errorUnauthorized()`,
  `errorProFeature()`, …), `handleError` for controllers, `rejectRequestFromMeetError` for
  middleware. Unknown errors must be logged and masked as 500; `globalErrorHandler` is the last
  resort and is registered after every route.
- **Distributed coordination**: `MutexService` (redlock-universal via `models/redis-lock.model.ts`).
  Meet runs multi-replica (OpenVidu High Availability, see the `deployment` spec): any garbage
  collection, migration or recording state transition must be lock-guarded. Lock TTLs cap at 24h.
  Cross-replica state lives in Redis keys, never in process memory; there is no pub/sub channel
  between replicas.
- **Scheduled tasks**: `TaskSchedulerService` + `*-scheduled-tasks.service.ts` (cron). Intervals,
  batch sizes and concurrency limits are all constants in `config/internal-config.ts`; reuse them
  instead of hardcoding numbers, and use `utils/concurrency.utils.ts` (`runConcurrently`) for fan-out.

## MongoDB schema migrations

Documents carry an internal `schemaVersion` (stripped from API responses). Migrations are
forward-only, run at startup under a distributed lock, and registered in
`src/migrations/migration-registry.ts`. A schema change requires: a migration function, bumping the
`*_SCHEMA_VERSION` in `config/internal-config.ts`, **and** updating the `MIGRATION_REV` timestamp on
that line (it exists to force merge conflicts between concurrent migration branches). Full details in
`src/migrations/README.md`.

## Configuration

- `src/environment.ts` → `MEET_ENV`. Almost every variable is `MEET_*` prefixed (LiveKit ones are
  not). Add new options here with a sane default; `logEnvVars()` prints the effective config at boot.
  A new operator-facing variable is a `deployment` spec change.
- `src/config/internal-config.ts` → `INTERNAL_CONFIG`: non-user-facing tuning constants (timeouts,
  TTLs, batch sizes, schema versions). `setInternalConfig()` exists for tests only.

## Tests

```bash
pnpm run test:unit                 # tests/unit, no external services needed
pnpm run test:integration-rooms    # one of many focused integration scripts
pnpm run test:types                # tsc --noEmit -p tsconfig.test.json: type-checks tests/**, CI-gated
pnpm run lint                      # --max-warnings 0
```

- Jest with `@swc/jest` (transpile only, no type-checking during a test run). `test:types` is the
  separate `tsc --noEmit` pass over `tests/**` (its own `tsconfig.test.json`, extending
  `tsconfig.prod.json` without the `**/*.test.ts` exclusion); run it after editing tests, since a
  Jest pass alone won't catch a type error there. Wired into `backend-unit-test.yaml` as its own step.
- `--experimental-vm-modules` is required and must not be dropped: ESM-only deps (chalk 5) and the
  cloud SDKs' internal dynamic `import()` need it, and `import.meta.url` is used in `path.utils.ts`.
- `tests/integration/**` hits a **real** MongoDB, Redis, LiveKit and S3/MinIO via supertest; they run
  one file at a time with `--forceExit` and are grouped into separate npm scripts so CI can shard them.
  They cannot pass without that infrastructure. Each file boots the whole app in the same process and
  the heap keeps growing across files, so a big shard (`test:integration-room-management`) runs in one
  worker that Jest recycles past 1 GB (`--maxWorkers=1 --workerIdleMemoryLimit=1GB`) instead of
  `--runInBand`, which ran out of heap in CI.
- `@openvidu-meet/typings` is mapped to the typings *source* in `jest.config.mjs`, so unit tests do
  not need a typings build.
