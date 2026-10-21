# Tasks

## 1. Apply member permission changes from the server

- [x] 1.1 Extract the live-apply block of the regeneration path in `meet-ce/backend/src/services/room-member.service.ts` into one method run under `withParticipantMetadataLock`, call it from `updateRoomMember` for a member in the meeting that keeps `meetingJoin` (before the renewal signal), and verify with a case in `meet-ce/backend/tests/unit/services/room-member-permissions.test.ts`: the LiveKit participant is updated with a grant without the camera when `mediaPublishVideo` is denied, and a promoted participant keeps the moderator merge.
- [x] 1.2 Add to `meet-ce/backend/tests/integration/api/room-members/update-room-member.test.ts` a member in the meeting whose `mediaPublishAudio` is denied: without any token renewal by the client, the LiveKit participant's permission no longer lists the microphone source, and the participant metadata that a later `refreshRoomMemberToken` or reconnection rebuilds the grant from denies it too. (Asserted on the metadata rather than through a refresh: once `fix-room-member-token-refresh-invalidation` lands, a refresh of the token issued before the update answers `401` and the meeting falls back to a regeneration, so a refresh-based assertion would break.)
- [x] 1.3 Reword the `updateRoomMember` description in `meet-ce/backend/openapi/room-members/room-members.yaml` (the new permissions are applied to a member already in the meeting at once; the member is also signalled so the meeting interface follows) and verify `pnpm run lint:api` passes.
- [x] 1.4 Run `./meet.sh test-unit-backend` and `pnpm run test:integration-room-members` (needs the local deployment; report it as not run otherwise), and `meet-ce/frontend/e2e/permissions.test.ts` through `./meet.sh test-e2e-frontend`.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "A permission change made with `updateRoomMember` during a meeting reached the media server only when the participant's client renewed its token, so a client that skipped the renewal kept publishing what it had lost. The server now applies the new media grant at once."
- [x] 2.2 openvidu.io: none.
