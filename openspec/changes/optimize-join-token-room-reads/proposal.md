# Proposal

## Why

Every request for a join token reads the same room document four to six times from MongoDB, and a token regeneration reads it five times. Regeneration is now the fallback of every refused renewal and runs after each permission change, so a wave of 30 participants joining costs about 150 room reads.

## What Changes

- The join token path reads the room once with `status`, `roles`, `config` and `access`, and passes it to the permission-source and join-token steps that each read it again.
- No observable change: same tokens, same checks, same order.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- REST API and embedded API: no contract change; fewer MongoDB queries per join and regeneration.
- Webhooks, meeting UI, console UI, deployment configuration: not affected.
- Code: `generateRoomMemberToken`, `resolvePermissionSourceFromSecret` and `generateTokenForJoiningMeeting` in `meet-ce/backend/src/services/room-member.service.ts`, and the secret check in `room-member.middleware.ts`.
- openvidu.io: none.

## Decisions to confirm

- How far to reuse. Proposed: read once inside the service call and pass the room down. Alternative: also reuse the room snapshot the middleware already read for the request, so the whole request reads it once.

## Source

3.10.0 pre-release audit, findings TK-8 and RM-10 (low, verified-live), introduced by #142 and #131.
