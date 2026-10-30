# Design

## Context

See proposal.md for the motivation. Measured on the same machine and harness as
`optimize-api-request-hot-path` (one replica, 10 participants, the reaction-like relay route behind
`roomMemberTokenValidator`, `withValidRoomId` and `withRoomPermission`), with that change's
optimizations already applied:

| | Without snapshot | With snapshot |
| --- | --- | --- |
| Backend CPU at 100 req/s | 40.0% | 35.9% |
| MongoDB CPU at 100 req/s | 12.3% | 7.6% |
| Median latency at 100 req/s | 7.2 ms | 6.2 ms |
| 300 req/s, median / p99 | 536 ms / 12.6 s (saturated) | 10.4 ms / 503 ms |

A native-driver variant of `BaseRepository.findOne` was measured too. Alone it made no measurable
difference at 100 req/s (40.4%); on top of the snapshot it saved another 2.4 points. It is out of
scope here (see Non-Goals).

The room reads on the in-meeting path today:

- `roomMemberTokenValidator` reads `rolesUpdatedAt`.
- `MeetingService.ensureHandEnabled` and `MeetingService.sendParticipantReaction` read `config`.
- `withRecordingStartAllowed` reads `config` (in `recording.middleware.ts`) for `POST /recordings`.

The request already has a request-scoped store: `RequestSessionService` over `AsyncLocalStorage`
(`RequestContext`), which holds the authenticated user and the room member token metadata.

The room `config` cannot change while the room has an active meeting: `RoomService` refuses config,
roles and access updates in that state. Outside a meeting, a request that reads `config` twice is
already not atomic: an update can land between the two reads today.

## Goals / Non-Goals

**Goals:**

- One MongoDB room read per request on the room member token path, where the handler only needs the
  room `config`.
- An explicit opt-in: a call site asks for the request's room on purpose. No read anywhere starts
  returning a snapshot without the call site saying so.

**Non-Goals:**

- A transparent cache in `RoomRepository.findByRoomId` or `RoomService.getMeetRoom`. Code that reads
  the room under a lock, or reads it again right after writing it, would silently get a pre-lock or
  pre-write value.
- Sharing the read for access token or API key requests (console and server-to-server traffic). Their
  permission checks read `owner`, `access` and `roles` and are not on the in-meeting hot path.
- Any cache that outlives the request, or is shared between requests or replicas.
- Switching repositories to the native MongoDB driver. On top of the snapshot it saved 2.4 points of
  CPU at 100 req/s (about 7%), but it drops Mongoose's casting of filter values across the 29 query
  sites of the repositories, each of which would need review.

## Decisions

### D1. The token validator reads `rolesUpdatedAt` and `config` together and stores the snapshot

`roomMemberTokenValidator` reads `['roomId', 'rolesUpdatedAt', 'config']` and, once the token is
accepted, stores that partial room in `RequestContext.room` through a new
`RequestSessionService.setRoom()` / `getRoom()` pair. The field list is one constant next to the
validator, so the snapshot never grows by accident.

- Rejected: reading the whole room. The room document carries the access URLs, which
  `RoomRepository.toDomain` enriches with the base URL on every read. That enrichment was the
  dominant cost in the 2026-09 chaos audit (finding N2), and the hot path does not need it.
- Rejected: reading the fields each route declares (for example a `withRoomFields(['config'])`
  middleware before `withAuth`). It is more flexible, but every route has to declare its fields, and
  today every hot handler needs only `config`.

### D2. Call sites opt in with `RoomService.getRequestRoomConfig(roomId)`

The method returns `config` from the snapshot when the snapshot exists and its `roomId` equals
`roomId`. Otherwise it reads `getMeetRoom(roomId, ['config'])` exactly as the call sites do today,
including the 404 for a missing room. `ensureHandEnabled`, `sendParticipantReaction` and
`withRecordingStartAllowed` switch to it. The server-relayed chat endpoint will use it too, if that
transport is chosen.

- Rejected: a generic `getRequestRoom(roomId, fields)`. It invites call sites that need `status` or
  `roles` (both change during a meeting) to read them from a snapshot. Serving only `config` keeps
  the safety argument to one sentence.

### D3. Writes and locked reads keep reading MongoDB

Every other `getMeetRoom` and `findByRoomId` call site stays untouched. This covers status
transitions, the role, access and config updates, deletions, token refresh (which reads `status` and
`roles`), and everything in the webhook and scheduler paths, which run outside a request context
anyway (`RequestSessionService` getters return `undefined` there).

### Several replicas

The snapshot lives in the request's `AsyncLocalStorage` context and dies with the request. It is
never shared between requests, processes or replicas, so no invalidation is needed. Another replica
updating the room's `config` while a request is in flight is either refused (active meeting) or
already racy today (no meeting), and the snapshot does not widen that window beyond the duration of
one request.

## Risks / Trade-offs

- [A future call site reads `config` from the snapshot in a write path that needs a fresh value] →
  The method's TSDoc states the rule (read-only gating, never under a lock or after a write in the
  same request), and the only way to get the snapshot is this one explicitly named method.
- [Every room member token request now projects `config`, even the ones that do not need it] →
  `config` is a small subdocument; the measured CPU still fell by 10%. If a profile later shows the
  projection cost on routes that never read `config`, D1's rejected per-route alternative is the
  fallback.
- [The snapshot is taken before a token refresh changes the participant's grant] → Token refresh
  does not read `config` from the snapshot (D3), and `config` is fixed during the meeting.

## Migration Plan

None. There is no persisted data, configuration or contract change. Rolling back means reverting
the commit.
