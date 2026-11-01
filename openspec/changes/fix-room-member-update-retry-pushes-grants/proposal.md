# Proposal

## Why

When `updateRoomMember` stores a permission change but the push to the participant's live connection fails (the media server times out or the participant is locked for over three seconds), the request answers `500` or `503` and the integrator retries. The retry compares with the stored permissions, finds no change and answers `200` without pushing anything, so a member with a client that ignores the renewal keeps the revoked grant.

## What Changes

- A member update that changes nothing still applies the stored permissions to the member's live participant, without revoking tokens and without signalling, so a retry completes the push that failed.
- A repeated push that matches the live grant has no effect.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: new requirement "A repeated member update completes the one that failed", next to "Permission changes reach a member in the meeting".

## Impact

- REST API: `updateRoomMember` (public) keeps its contract; an update without changes may now answer an error when the member is in a meeting and the push fails.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: the no-change branch of `updateRoomMember` in `room-member.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- A push that fails after the change was stored. Proposed: keep answering the error so the integrator knows the live grant was not applied, and let the retry complete it. Alternative: log it and answer `200`, as for the renewal notice, since the stored change already rules new tokens (the live grant then stays old until the next renewal).

## Source

3.10.0 pre-release audit, finding RM-6 (low, static-high), introduced by #131.
