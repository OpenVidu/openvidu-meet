# Tasks

## 1. Apply the stored permissions on a no-change update

- [ ] 1.1 In `updateRoomMember` (`meet-ce/backend/src/services/room-member.service.ts`, the no-change branch before token revocation), call the live push for a member in a meeting instead of returning early, without touching `permissionsUpdatedAt` and without the renewal signal. Verified in `tests/unit/services/room-member-grant.test.ts`: the push is attempted, no signal is sent, `permissionsUpdatedAt` is unchanged, and a member outside the meeting costs no media server call.
- [ ] 1.2 Keep the archived behavior of an empty update (tokens stay valid) in `tests/integration/api/room-members/update-room-member.test.ts` (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. It completes the 3.10.0 grant push (#131); check that the line saying `updateRoomMember` succeeds when the notice cannot be delivered still reads true.
- [ ] 2.2 openvidu.io: none.
