# Tasks

## 1. Push the new grant

- [ ] 1.1 In `updateUserRole` of `meet-ce/backend/src/services/user.service.ts`, replace `notifyParticipantPermissionsUpdate` by the live push of `room-member.service.ts` (`applyPermissionsToLiveParticipant` with the user's recomputed permissions for each room of `getUserMeetings`), removing the participant when the user has no access, and still signal the client to renew. Verified in `tests/unit/services/room-member-grant.test.ts` (grant pushed, removal on lost access, a failure of one room does not stop the others).
- [ ] 1.2 Integration: extend `tests/integration/api/users/update-user-role.test.ts` with an admin in a meeting turned `room_member` (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. It completes the 3.10.0 server-side grant push (#131), which has no previous release to differ from.
- [ ] 2.2 openvidu.io: none.
