# Tasks

## 1. Join and renewal checks

- [ ] 1.1 Extract the currency checks of `verifyRoomMemberToken` (`meet-ce/backend/src/middlewares/auth.middleware.ts`) into one function taking the token metadata and the identity, used by the middleware, by `refreshRoomMemberToken` and by the join handler. Confirm in the `livekit-client` version of the frontend that the token pushed by the media server replaces the one used for reconnection. Verified by the existing token tests staying green.
- [ ] 1.2 In `handleParticipantJoined` of `meet-ce/backend/src/services/livekit-webhook.service.ts`, before sending `participantJoined`, parse the session's metadata, run the shared checks and remove the participant (`removeParticipant`) when they fail; skip sessions without Meet metadata. Verified in `tests/unit/services/livekit-webhook.service.test.ts` with a stale `iat` (removed, no webhook), a current one (kept) and a session without metadata (ignored).
- [ ] 1.3 In `applyPermissionsToLiveParticipant` of `meet-ce/backend/src/services/room-member.service.ts`, write `iat: Date.now()` in the pushed metadata (add `iat` to the participant metadata type if it is not carried). Verified in `tests/unit/services/room-member-grant.test.ts`: the metadata of every push carries a fresh `iat`.
- [ ] 1.4 In `refreshRoomMemberToken`, run the shared checks on the live metadata and answer `401` when they fail. Verified in `tests/unit/services/room-member-permissions.test.ts` (stale live metadata refused, pushed metadata accepted) and in `tests/integration/api/room-members/refresh-room-member-token.test.ts` for the demotion flow of decision 3.
- [ ] 1.5 Integration: with a participant connecting through the test helpers with the token it held before a demotion and before a `permissions` update, assert that it is removed and that a reconnection with the pushed token stays. Add to the existing `update-room-member.test.ts` and `tests/integration/api/security/room-members-security.test.ts`. Needs the OpenVidu local deployment; report as not run when unavailable.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. The fix makes the 3.10.0 `Fixed` line "`updateRoomMember` applies the new media grant at once" hold against a reconnecting client; check that its wording does not promise more.
- [ ] 2.2 openvidu.io: none. Update the `permissions` scenario "Client that ignores the renewal request" only through the delta of this change.
