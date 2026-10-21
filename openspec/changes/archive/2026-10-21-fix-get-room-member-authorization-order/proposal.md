# Proposal

## Why

`getRoomMember` checks that the member exists before it checks who is asking, so any caller that passes
authentication (a room member token from the anonymous speaker link, a `room_manager` who does not own the
room) learns from `404` versus `403` which `memberId` values are members of the room. Identified guest ids
are personal access secrets and user ids name accounts; neither should be confirmable by someone who may not
read them.

## What Changes

- `getRoomMember` authorizes the caller first (`403`), and only then looks the member up (`404`).
- A room that does not exist still answers `404` first, as every room-scoped operation does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: "Reading one member" fixes the order of the checks and adds the probing scenario.

## Impact

- REST API: `getRoomMember` (public). A caller without access to a member that does not exist now gets `403`
  instead of `404`; callers with access see no difference. The response bodies are unchanged. The OpenAPI
  already lists both codes; its description is reworded with the access rules (see
  `fix-rooms-openapi-wording`, which lists who may read a member).
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: none (the console only reads
  members as a manager).
- Code: `meet-ce/backend/src/middlewares/room-member.middleware.ts` (`authorizeRoomMemberAccess`).
- openvidu.io: none.

## Decisions to confirm

- Status code change on a public operation: a caller without access gets `403` for a missing member, where it
  got `404`. Alternative: keep `404` first and accept the existence leak.
- A missing room still answers `404` before authorization, consistent with the `permissions` requirement
  "Enforcement at the API". Alternative: `403` for a missing room too, to hide room existence from callers
  without access.
