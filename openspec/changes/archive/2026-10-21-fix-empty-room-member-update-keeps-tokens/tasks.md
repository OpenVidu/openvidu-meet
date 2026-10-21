# Tasks

## 1. Revoke only on a change

- [x] 1.1 In `updateRoomMember` (`meet-ce/backend/src/services/room-member.service.ts`), read the stored `effectivePermissions` with the member, and advance `permissionsUpdatedAt`, kick or notify only when the recomputed set differs; verify with `meet-ce/backend/tests/integration/api/room-members/update-room-member.test.ts`: turn "should allow empty update body (no changes)" into one that also checks `permissionsUpdatedAt` is unchanged and a token issued before the call is still accepted, and add a case where `customPermissions` equal to the base role leave `permissionsUpdatedAt` unchanged.
- [x] 1.2 In the same file, extend "should send permissions-updated signal when member permissions change and participant is in meeting" with the reverse case: an empty-body update of a member in the meeting sends no signal.
- [x] 1.3 Reword the `updateRoomMember` description in `meet-ce/backend/openapi/room-members/room-members.yaml` and `permissionsUpdatedAt` in `meet-ce/backend/openapi/room-members/schemas/meet-room-member.yaml` (tokens are revoked when the effective permissions change), and verify `pnpm run lint:api` passes.
- [x] 1.4 Run `pnpm run test:integration-room-members` (needs the local deployment; report it as not run otherwise).

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "An `updateRoomMember` that changed nothing, such as one with an empty body, revoked the member's room member tokens and told a member in the meeting that their permissions were updated. Only an update that changes the member's effective permissions does so now."
- [x] 2.2 openvidu.io: none.
