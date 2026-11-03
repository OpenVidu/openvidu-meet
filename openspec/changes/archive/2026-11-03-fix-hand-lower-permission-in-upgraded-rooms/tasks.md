# Tasks

## 1. Migrations

- [x] 1.1 In `room-migrations.ts`, make the v5 to v6 transform grant `participantHandLower` to the moderator role after the normalization. Verify in `permission-backfill-migrations.test.ts` that the moderator role gets it and the speaker role does not, and in `room-migrations.test.ts` (integration) that a room migrated through every step ends with the moderator role granting it.
- [x] 1.2 In `room-member-migrations.ts`, give the v3 to v4 step a transform that grants `participantHandLower` in the effective permissions of a member with the moderator role and leaves the overlay alone. Verify in `permission-backfill-migrations.test.ts` with one moderator and one speaker member.
- [x] 1.3 Update the TSDoc of `participantHandLower` in `room-member-permissions.ts` to say that a stored room or member is migrated with it granted to the moderator role, and that only tokens are completed with it denied.

## 2. Specs and docs

- [x] 2.1 Add the `permissions` delta ("Permissions missing from older data") and verify with `npx openspec validate fix-hand-lower-permission-in-upgraded-rooms --strict`.
- [x] 2.2 openvidu.io `docs/meet/features/meetings/raise-hand.md` (branch `next`): the paragraph that says rooms and members from before the release start without `participantHandLower` says instead that the moderator role of existing rooms and its members have it.
