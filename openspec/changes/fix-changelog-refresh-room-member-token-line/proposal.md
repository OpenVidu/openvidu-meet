# Proposal

## Why

The 3.10.0 changelog line about `refreshRoomMemberToken` names an internal endpoint under Integration, which integrators do not call, and lists only a change of the member's permissions or of the user's role. The code also covers changes of the room's roles or access and the deletion of the member or of the user.

## What Changes

- The line is reworded to describe what changed for the people it affects without naming the internal endpoint, and to list every case covered.
- Documentation only: nothing observable changes in the product.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Documentation of behavior `authentication` and `room-members` already specify.

## Impact

- `CHANGELOG.md` only. REST API, webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Where the line lives. Proposed: keep it under `Fixed` > `Integration`, reworded. Alternative: move it to `Fixed` > `UI`, since the observable effect is a participant ejected or kept in a meeting.

## Source

3.10.0 pre-release audit, "CHANGELOG lines that do not match the code" (roles-tokens-perf report), line introduced by #142.
