# Design

## Context

See proposal.md for the motivation. These numbers come from one backend replica on a single machine,
`NODE_ENV=development` (so the rate limiters are off), with log level `info`. Ten participants
reached it through a room-scoped route behind `roomMemberTokenValidator`, `withValidRoomId` and
`withRoomPermission`, and the handler ended in `LiveKitService.sendData`. The CPU profile was taken
with the V8 sampling profiler at 100 requests per second.

| Cost per request | Before | After (prototype) |
| ---------------- | ------ | ----------------- |
| Backend CPU at 100 req/s | 65.7% of one core | 42.1% |
| Median latency, send to receive | 11.4 ms | 7.1 ms |
| Median time in authentication | 3.9 ms | 1.8 ms |
| Median time in `sendData` | 5.3 ms | 3.2 ms |
| Healthy at 200 req/s | no (p99 97 ms, CPU 105%) | yes (p50 7.3 ms, CPU 83%) |
| Saturation | about 150 req/s | between 200 and 300 req/s |

Where the profile placed the removable work, as a share of busy CPU before the change:

- `withValidRoomId` was 5.2%. `nonEmptySanitizedRoomId('roomId')` returns a new Zod schema on every
  call. Because the backend runs Zod in compiled mode (`import 'zod/compile'`), each new schema is
  also code-generated (`compileFn`, `generateCheck`) before it parses one string.
  `nonEmptySanitizedRecordingId('recordingId')` in `withValidRecordingId` does the same thing, and so
  does the call inside the recording ID schema's transform.
- MongoDB (driver, Mongoose and BSON) was about 23%. That covers three `findOne` calls on the room
  collection per request: authentication reads `rolesUpdatedAt`, `withRoomPermission` calls
  `meetRoomExists`, and the handler reads `config`. The `meetRoomExists` call is redundant when the
  room member token was validated against that same room: the validator has already refused the
  request if the room does not exist.
- Each LiveKit API call was about 5%, and signing the admin JWT that `livekit-server-sdk` creates for
  every Twirp call accounts for 3 to 4 points of that. `sendData` made two calls: `findRoom` (a
  `listRooms`) and then the send.
- Authentication awaited the room lookup (MongoDB), then the revocation lookup (Redis), then the
  member and user lookups (MongoDB), one after the other. The latency was those round trips added
  together; the CPU spent on them was small.
- `express.static` on the frontend directory is mounted before every API router, so each API request
  first costs a filesystem lookup that fails (`serveStatic`, 1.4%).

## Goals / Non-Goals

**Goals:**

- Remove repeated and discarded work from the room-scoped request path without changing any answer
  the API gives.
- Keep the measurement repeatable, so the chat transport decision can be made on the new numbers.

**Non-Goals:**

- Caching across requests: the room document, token checks, permissions or the LiveKit admin JWT.
  Each of these would delay a revocation, need invalidation across replicas, or patch the LiveKit
  SDK.
- Sharing one room read between authentication and the handler within a request. That needs a
  request-scoped read model that knows every field the later steps will ask for. It is the next
  largest saving (one of the two remaining room queries) and a follow-up of its own.
- Replacing Mongoose with the native driver for hot lookups.
- Rate limiting, which `apiLimiter` already does per IP.

## Decisions

### D1. Build the parameter schemas once, at module load

`room.schema.ts` exports a ready schema for the `roomId` route parameter, and `recording.schema.ts`
does the same for `recordingId`. The validators and the recording ID transform use those schemas.
The `nonEmptySanitized*Id(fieldName)` builders stay for the body and query schemas that embed them
under another field name: those are module-level constants already, so they are built once.

- Rejected: memoizing the builder by `fieldName`. It hides the cost behind a cache when the call
  sites can simply hold the schema.
- Rejected: disabling compiled mode for these schemas. Compiled mode is what makes the module-level
  schemas fast; the waste came from creating schemas at request time.

### D2. Validate a room member token with independent lookups in parallel

`roomMemberTokenValidator` starts the lookups that depend only on the decoded token together:
- the room's `rolesUpdatedAt`;
- the participant's revocation;
- the member's `permissionsUpdatedAt`, when the token names a member;
- the user's `roleUpdatedAt`, when it names a user.

It awaits them all, then applies the same checks in the same order as today. Any failure still ends
in `errorInvalidToken()`, as the current `try`/`catch` does.

- Rejected: keeping the room lookup first so a missing room skips the other lookups. That only saves
  work for requests that are refused anyway, and it costs a round trip on every accepted one.

### D3. Skip the second room existence check for a token of the same room

`withRoomPermission` and `withRoomPermissionForOthers` skip `meetRoomExists` when
`RequestSessionService.getRoomIdFromMember()` equals the route's `roomId`. Requests authenticated any
other way (access token, API key) keep the check, because nothing has looked at the room before it.

- Rejected: removing `meetRoomExists` from the middleware altogether. For an access token or an API
  key it is what turns a missing room into a 404 before the permission check.

### D4. Send first, treat LiveKit's not-found as "no meeting"

`LiveKitService.sendData` calls `lk.room.sendData` directly. If the error matches the existing
`isNotFoundError`, it logs the same warning as today and returns. Any other error becomes the same
`internalError` as today. LiveKit's `SendData` answers `ErrRoomNotFound` when the room is not on any
node, which the SDK surfaces as a Twirp `not_found`. `deleteRoom` and `mutePublishedTrack` already
rely on this.

- Rejected: keeping the check behind a short in-process cache of existing rooms. It is state in
  process memory, it goes stale across replicas, and the check races with the send anyway.

### D5. Mount the frontend static files after the API routers

In `server.ts`, `express.static(frontendDirectoryPath, { index: false })` moves after the API and
internal API routers, the health and info routes, and the webcomponent bundle routes. It stays
before the SPA catch-all. API paths never resolve to a file in the frontend build, so no request
changes its answer; API requests just stop paying for a failed lookup.

### Several replicas

Nothing here adds state that outlives a request. The schemas built at module load are immutable
code, the same in every replica. The parallel lookups read the same documents and keys as before,
with the same lack of atomicity between them. The removed existence checks were never coordination
between replicas: each replica asked MongoDB or LiveKit directly, and still gets the same answer
from the authentication lookup or from the send.

## Risks / Trade-offs

- [The SDK reports a missing room in a way `isNotFoundError` does not match] → A unit case pins
  `sendData` to resolve on a Twirp not-found error and to reject on any other. The backend
  integration suites that signal an ended meeting cover the real LiveKit answer.
- [The route parameter and the token disagree on sanitization] → D3 compares the sanitized route
  parameter, which `withValidRoomId` has already written back, with the `roomId` of the token
  metadata. A mismatch falls back to the existing lookup, never to an accept.
- [Moving the static mount shadows a route, or is shadowed by one] → The SPA catch-all already
  excludes `api` and `internal-api` paths. The frontend e2e suite loads the SPA and its assets
  through the moved mount.
- [The gains depend on this machine] → The table above compares two runs on the same machine and
  infrastructure. The task list repeats the measurement and records it in the pull request.

## Migration Plan

None. There is no persisted data, configuration or contract change. Rolling back means reverting
the commit.
