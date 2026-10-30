# Tasks

## 1. Reactions need a running meeting

- [x] 1.1 Make the reaction operation resolve the room's live meeting first, with the same no-active-meeting `404` the hand operations raise, before checking `reactions.enabled` and relaying; verify with a case in `meet-ce/backend/tests/integration/api/meetings/reaction.test.ts` that sends a reaction after the meeting ended and expects `404`; report it as not run if the local deployment is unavailable.
- [x] 1.2 Point the `404` of `participantReactionSend` in `meet-ce/backend/openapi/meetings/internal/meetings.yaml` to a response that covers both a missing room and a room without a running meeting (as `participantHandUpdate` documents its `404`), and mention it in the operation description; verify with `pnpm run lint:api`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. Reactions are new in 3.10.0 (listed under `### Added`), so this fix belongs to that entry, and the operation is internal.
- [x] 2.2 openvidu.io: none.
