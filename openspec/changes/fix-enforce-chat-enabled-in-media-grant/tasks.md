# Tasks

## 1. Grant follows the room chat switch

- [ ] 1.1 Make the publish grant in `meet-ce/backend/src/services/room-member.service.ts` take the room's `config.chat.enabled` into account in every path that builds it (join token, regeneration in the meeting, promotion and demotion), and verify with cases in `meet-ce/backend/tests/unit/services/room-member-grant.test.ts`: `canPublishData` is `false` with chat disabled and `chatWrite` granted, and `true` with chat enabled and `chatWrite` granted.
- [ ] 1.2 Add a case to `meet-ce/backend/tests/integration/api/room-members/generate-room-member-token.test.ts`: a join token for a moderator of a room with `config.chat.enabled` `false` carries a LiveKit grant without `canPublishData`; run `pnpm run test:integration-room-members` (needs the local deployment; report it as not run otherwise).
- [ ] 1.3 Reword `MeetChatConfig.enabled` in `meet-ce/backend/openapi/rooms/schemas/meet-room-config.yaml` and its TSDoc in `meet-ce/typings/src/database/room-config.ts`: when `false` the meeting offers no chat and the media server refuses chat messages from every participant, whatever their `chatRead` and `chatWrite`; verify `pnpm run lint:api` passes.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "A room's `config.chat.enabled` `false` was enforced in the interface only, so a modified client holding `chatWrite` could still send chat messages. The media server now refuses them."
- [ ] 2.2 openvidu.io: none.
