# Proposal

## Why

When an administrator changes a user's role, the user's live meetings are only told to renew their token. A client that ignores the notice keeps the old grant: an administrator turned `room_member` can keep publishing camera, screen and data in every meeting they were in, with permissions the new role does not give.

## What Changes

- Changing a user's role applies the recomputed permissions to the user's live participants at once, as a member update, a promotion or a demotion already do.
- A user whom the new role leaves without access to a room is removed from that meeting instead of only being signalled.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `permissions`: new requirement "The media grant follows a user's role change", next to "The media grant follows permission changes".

## Impact

- REST API: `updateUserRole` (public) unchanged in contract; its effect on live meetings becomes immediate.
- Meeting UI: the existing notice of updated permissions still shows; a user who lost access leaves the meeting.
- Webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `updateUserRole` of `user.service.ts` and the live push of `room-member.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- A user who loses access to the room. Proposed: removed from the meeting by the server, as `users` "Role change during a meeting" and `meeting-join` already require. Alternative: keep the notice only.

## Source

3.10.0 pre-release audit, finding RM-5 (low, static-high), introduced by #131.
