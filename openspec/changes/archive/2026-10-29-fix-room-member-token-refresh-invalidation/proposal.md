# Proposal

## Why

`refreshRoomMemberToken` checks only the signature (with a 10 second tolerance on expiry) and the room of the
token it renews, then rebuilds the new token from the participant's state in the meeting. None of the checks that
invalidate a room member token after a change runs there, so a participant whose permissions or account role were
reduced during the meeting can renew the token issued before the change, keep the old permissions with a fresh
issue time that every later check accepts, and do so for as long as they stay connected.

## What Changes

- `refreshRoomMemberToken` refuses with `401` the room member tokens that the other endpoints refuse after a change:
  one issued before the room's roles or access were updated, before its room member's permissions changed or after
  the member was deleted, before its user's role changed or after the user was deleted. The refresh keeps its 10
  second tolerance on expiry.
- A token issued before the participant was demoted from moderator stays renewable, as today: the refresh reads the
  participant after the demotion and returns the restored permissions, while every other endpoint keeps refusing
  that token.
- The meeting answers a refresh refused with `401` by obtaining a new join token with the credentials the
  participant entered with (the same regeneration the "permissions updated" notice already triggers), and only a
  refusal of that regeneration takes the participant out of the meeting. A participant who missed the notice of a
  change therefore stays in the meeting with their current permissions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: "Refreshing a join token" refuses the tokens that `authentication` invalidates, a demotion
  excepted; "The meeting keeps its token current" falls back to a regeneration when the refresh is refused with
  `401`.
- `authentication`: "Demotion revokes room member tokens" names the refresh as the one place that still renews a
  token issued before the demotion.

## Impact

- Internal API: `refreshRoomMemberToken` (`meet-ce/backend/openapi/room-members/internal/room-members.yaml`), whose
  description names the refused tokens. Status codes unchanged (`401` already listed). No public contract changes.
- Meeting UI and embedded element (`shared-meet-components`): token renewal in the meeting gains the fallback. No
  embedded API change.
- Code: `meet-ce/backend/src/middlewares/auth.middleware.ts` (the room member token checks become reusable),
  `meet-ce/backend/src/services/room-member.service.ts` (refresh), and the room member context of the library.
  No persisted field, no migration.
- Several replicas: the refresh's checks read MongoDB (room, member, user timestamps), shared by every replica, so
  a change made through one replica is enforced by a refresh on any other.
- openvidu.io: no page changes.

## Severity

Affected releases: 3.8.0 and 3.9.0 (room member token refresh introduced with the room member model in 3.8.0);
confirm the range when preparing the advisory.

Conditions to exploit, all of them needed:

- The attacker is a participant connected to a room's meeting and holds their own join token.
- While they stay connected, their permissions in that room are reduced without removing them from the meeting:
  `updateRoomMember` changes their `baseRole` or `customPermissions` keeping `meetingJoin`, or `updateUserRole`
  changes their account role (for example an admin made `room_manager` or `room_member`, which with the stock
  client takes them to the "Room access revoked" screen when they no longer have access).
- Their client ignores the "permissions updated" notice and calls `refreshRoomMemberToken` with the previous token
  instead, before each token expires. This needs a modified client or direct API calls, nothing else.
- Not reachable: a room roles or access update (`updateRoomRoles`, `updateRoomAccess` answer `409` during a
  meeting), refused anyway for consistency with every other endpoint; and a demotion from moderator, since the
  refresh reads the participant's state after the demotion and returns the restored permissions.

Impact: the participant keeps, for the rest of their stay in the meeting and up to `MEET_ROOM_MEMBER_TOKEN_EXPIRATION`
(default `2h`) after their last refresh, every permission they held before the change: for a former admin or owner
every permission of the room (end the meeting, remove, mute and promote participants, start, stop, download and
delete its recordings), and the media grants of their token on reconnection. An administrator's revocation is
silently defeated; removing the participant from the meeting, deleting the member or deleting the user still ends
it.

Rating: Medium (authenticated participant, one room, needs a revocation to happen while they are connected).

## Decisions to confirm

- Decided (USER, 2026-10-16): the refresh exempts the demotion revocation and keeps renewing a token issued before
  a demotion into one with the restored permissions. A client cached in a browser during an upgrade refreshes after
  every demotion and has no regeneration fallback, so refusing it would send every participant demoted in that
  window to "Room access revoked". Rejected alternative: refuse it like every other endpoint and let the new
  client's fallback regenerate.
- A refresh refused with `401` falls back to a regeneration instead of taking the participant out at once
  (alternative: keep today's client behavior, which would send any participant who missed a permissions notice to
  the "Room access revoked" screen at their next scheduled renewal).
