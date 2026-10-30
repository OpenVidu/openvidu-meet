# Proposal

## Why

An in-meeting request authenticated with a room member token reads its room from MongoDB twice. The
token validator reads it to compare `rolesUpdatedAt` with the token, and the handler reads it again
for the room `config` that gates the feature (raise hand, reactions, recording start). In the load
test behind `optimize-api-request-hot-path`, sharing that one read cut backend CPU by a further 10%
and MongoDB CPU by 38%, and lowered the median latency by 1 ms. With both changes, one replica went
from collapsing at 300 requests per second to running them at a 10 ms median. This change is kept
apart from that one because it introduces a request-scoped read model, which is a pattern decision of
its own, and can land later.

## What Changes

- The room member token validator reads the room's `rolesUpdatedAt` and `config` in one query and
  keeps that read as the room snapshot of the request.
- Handlers on the in-meeting path that only read the room `config` take it from the snapshot when the
  snapshot is for the same room, instead of querying MongoDB again: the raise hand switch, the
  reactions switch and the recording switch. Any other request (access token, API key, another room)
  reads MongoDB as today.
- The token refresh takes the room `config` for the chat grant from the read that verified the
  previous token, instead of reading the room again.
- Reads that decide a write, or that run under a lock, keep reading MongoDB: status transitions,
  role and access updates, deletions.

No behavior changes: the snapshot only serves the room `config`, which Meet refuses to change while a
meeting is active, and it never lives past the request that read it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is an efficiency refactor; no requirement in `openspec/specs/` changes, so the change
declares `skip_specs`.

## Impact

- **REST API, internal API, webhooks, embedded API, meeting UI, console UI:** no contract or behavior
  change.
- **Deployment:** no new configuration. One MongoDB query less per in-meeting request that gates on
  the room `config`.
- **Code:** backend only (`meet-ce/backend`): the request context model, the room member token
  validator, `RoomService`, the token refresh in `RoomMemberService` and the handlers that switch
  features on the room `config`.
- **PRO:** `RoomService` gains a method; no existing overridable signature changes.
- **openvidu.io:** no page changes.
- **Related change:** `optimize-api-request-hot-path` is independent. If it lands first, its D3
  check ("the token was validated against this room") can read the snapshot instead of comparing
  room IDs; task 3.3 covers that.
