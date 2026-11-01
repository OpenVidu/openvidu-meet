# Tasks

## 1. Revoke before the update, and under one clock

- [ ] 1.1 In the demotion path of `meet-ce/backend/src/services/room-member.service.ts` (the write followed by `revokeIssuedTokens`, about lines 1158-1165), stamp the revocation before `updateParticipant`. Verify in `meet-ce/backend/tests/unit/services/room-member-permissions.test.ts`: when the media server update rejects, the stamp was written and no `participantRoleChanged` webhook is sent.
- [ ] 1.2 Raise `PARTICIPANT_METADATA_LOCK_TTL` in `meet-ce/backend/src/config/internal-config.ts` above two media server calls (the SDK default timeout is 10 s each). Verify with a unit assertion of that relation.
- [ ] 1.3 In the token issue path and `participant-token-revocation.service.ts`, issue a token under the lock with a time later than the recorded stamp and stamp a demotion with the clock margin; remove the single-clock comment at `room-member.service.ts:639`. Verify with unit cases that mock the clock collaborator (a stamp ahead of `now` still revokes the earlier token and accepts the later one; no real waits).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. It is a fix to the unreleased participant role command (#103).
- [ ] 2.2 openvidu.io: none.
