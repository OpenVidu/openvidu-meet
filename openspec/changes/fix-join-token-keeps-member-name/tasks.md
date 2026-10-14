# Tasks

## 1. Server name precedence

- [ ] 1.1 In `generateRoomMemberToken` (`meet-ce/backend/src/services/room-member.service.ts`), resolve the name as the identified guest's, then the authenticated user's member or account name, then `participantName`, and use `participantName` first when the room has `e2ee.enabled`; verify with cases in `meet-ce/backend/tests/integration/api/room-members/generate-room-member-token.test.ts`: a guest link with `participantName` "Bob" joins under the guest's name, a signed-in user through the speaker link joins under their account name, an anonymous link joins under the given name, and an encrypted room keeps the given name.
- [ ] 1.2 Reword `participantName` in `meet-ce/backend/openapi/room-members/internal/schemas/room-member-token-options.yaml` (ignored when the token is bound to a member or a user, except in encrypted rooms) and verify `pnpm run lint:api` passes.
- [ ] 1.3 Run `pnpm run test:integration-room-members` and `./meet.sh test-e2e-frontend` for the join-screen suites (`access.test.ts`, `e2ee.test.ts`), which need the local deployment; report them as not run otherwise.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "The name an identified guest, a member user or a signed-in user joined a meeting with was locked by the join screen only, so a modified client could join under any name. Outside encrypted rooms the server now uses the member's or the user's name."
- [ ] 2.2 openvidu.io: none.
