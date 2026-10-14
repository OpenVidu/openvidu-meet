# Tasks

## 1. Cover the specified behavior with tests

- [ ] 1.1 Add to `meet-ce/backend/tests/integration/api/meetings/kick-participant.test.ts` a case that kicks a participant and then generates a new join token with the same access, expecting it to be granted; report it as not run if the local deployment is unavailable.
- [ ] 1.2 Add to `meet-ce/frontend/e2e/participants.test.ts` a test where a removed speaker opens the same link again and enters the running meeting; report it as not run if the local deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line, the behavior does not change.
- [ ] 2.2 openvidu.io `next`, `docs/meet/features/meetings/moderation.md`: in "Removing participants", add that a removed participant can join again with the same access and that keeping them out means revoking their access to the room (link to `../rooms/access.md` and `../room-members/management.md`).
