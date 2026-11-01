# Tasks

## 1. Read the room once

- [ ] 1.1 In `generateRoomMemberToken` of `meet-ce/backend/src/services/room-member.service.ts` read `status`, `roles`, `config` and `access` once and pass the room to `resolvePermissionSourceFromSecret` (about line 794) and `generateTokenForJoiningMeeting` (about lines 484 and 568), removing their own reads. Verify in `meet-ce/backend/tests/unit/services/room-member-permissions.test.ts` that one join and one regeneration call the room repository once, with the same tokens as before.
- [ ] 1.2 Run the room member token integration tests in `meet-ce/backend/tests/integration/api/room-members/` unchanged (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none (performance without an observable change).
- [ ] 2.2 openvidu.io: none.
