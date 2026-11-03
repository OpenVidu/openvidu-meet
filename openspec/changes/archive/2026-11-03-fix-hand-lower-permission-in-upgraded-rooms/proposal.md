# Proposal

## Why

The room and member migrations that add `participantHandLower` leave it denied to the moderator role of every room created before 3.10.0, and to every member with the moderator role. The meeting gives the raised-hand sound and notice, Lower hand and Lower all hands only to holders of that permission, so a moderator of an upgraded room sees hands go up on the tiles and in the panel but is never notified and cannot lower any; only admins and the owner can. A room created from 3.10.0 on grants the moderator role the permission, so the same moderator behaves differently depending on when the room was created.

## What Changes

- The room migration that adds `participantHandLower` (v5 to v6) grants it to the moderator role, and the member migration (v3 to v4) grants it to members with the moderator role. The speaker role and speaker members keep it denied.
- Tokens issued before 3.10.0 are still completed with the permission denied; they are replaced when their holder refreshes or rejoins.
- No new schema version: both steps are unreleased, so they change in place. `CHANGELOG.md` needs no clause, since raise hand is new in 3.10.0 and behaves the same in every room.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `permissions`: "Permissions missing from older data" completes `participantHandLower` to granted for the moderator role and for members with the moderator role, and keeps it denied in a token.

## Impact

- REST API, webhooks, embedded API, console UI, deployment configuration: no change to the contract; only the stored permissions of rooms and members from before 3.10.0.
- Meeting UI: moderators of upgraded rooms hear the raised-hand sound, see the notice and can lower hands, with no frontend change.
- Code: `meet-ce/backend/src/migrations/room-migrations.ts`, `room-member-migrations.ts`, and the TSDoc of `participantHandLower` in `meet-ce/typings/src/database/room-member-permissions.ts`.
- openvidu.io: `docs/meet/features/meetings/raise-hand.md` no longer says that rooms and members from before the release start without the permission.

## Source

3.10.0 pre-release audit, finding IM-1 (medium, static-high), introduced by #109. Resolved by granting the permission in the unreleased migration instead of documenting the limit, as the 3.9.0 `participantMute` entry did.
