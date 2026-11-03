# Tasks

## 1. Revoke before the update, and under one clock

- [x] 1.1 The demotion stamps the revocation before `updateParticipant` (done by `fix-reconnect-with-earlier-join-token`, whose branch this one builds on). Verified in `tests/unit/services/participant-promotion-auto-start.test.ts`: when the media server update rejects, the revocation is in place and no `participantRoleChanged` webhook is sent.
- [x] 1.2 `PARTICIPANT_METADATA_LOCK_TTL` in `meet-ce/backend/src/config/internal-config.ts` goes from 10 s to 30 s, above the two media server requests it covers (the read and the update). The request timeout is now explicit (`LIVEKIT_REQUEST_TIMEOUT_SECONDS`, 10 s, the SDK default, passed to the media server client), and `room-member-permissions.test.ts` asserts the relation.
- [x] 1.3 `ParticipantTokenRevocationService.revokeIssuedTokens` stamps the revocation ahead of the replica's clock by `REFRESH_CLOCK_TOLERANCE_SECONDS`, and the new `getIssueTime` gives every token issued for a participant a time later than the recorded stamp: the join token of a member (`generateTokenForJoiningMeeting`), the regeneration and the update pushes (`applyPermissionsToLiveParticipant`), the role-change push and the renewal (`buildTokenMetadataFromParticipant`, under the lock). The single-clock comment is gone. Verified in `tests/unit/services/participant-token-revocation.service.test.ts`, which mocks the clock (a revocation still revokes a token from a clock slightly ahead, and a replica whose clock is behind issues a token the revocation accepts; no real waits).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. It is a fix to the unreleased participant role command (#103).
- [x] 2.2 openvidu.io: none.
