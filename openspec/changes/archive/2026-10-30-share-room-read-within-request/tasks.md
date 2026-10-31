# Tasks

## 1. Room snapshot in the request context (D1)

- [x] 1.1 Add `room?: RequestRoomSnapshot` to `RequestContext`, with the type derived from the `REQUEST_ROOM_FIELDS` constant (`['roomId', 'rolesUpdatedAt', 'config']`) in `request-context.model.ts`, and a `setRoom()` / `getRoom(roomId)` pair to `RequestSessionService`, following its existing setters (ignored outside a request context); `getRoom(roomId)` returns the snapshot only for that room. Verify with `pnpm run test:types` and `pnpm run lint` in `meet-ce/backend`.
- [x] 1.2 Make `roomMemberTokenValidator` read `REQUEST_ROOM_FIELDS`, and store the result with `setRoom()` only once the token is accepted. Verify with new cases in `tests/unit/middlewares/auth.middleware.test.ts`: an accepted token leaves the snapshot in the request context; a refused one (outdated roles, revoked, outdated member permissions) leaves none.

## 2. Opt-in read of the room config (D2)

- [x] 2.1 Add `RoomService.getRequestRoomConfig(roomId)`. It returns `config` from the snapshot when its `roomId` matches; otherwise it falls back to `getMeetRoom(roomId, ['config'])`, keeping the 404 for a missing room. Its TSDoc states that it gates a feature and never serves as the config a write starts from, because it may have been read at authentication. Verify with cases in `tests/unit/services/room.service.test.ts` (the file for that service): snapshot of the same room means no repository call; another room, or no snapshot, reads the repository; a missing room answers 404.
- [x] 2.2 Switch `MeetingService.ensureHandEnabled`, `MeetingService.sendParticipantReaction` and `withRecordingStartAllowed` to `getRequestRoomConfig`. Verify that `tests/unit/services/meeting-mute.test.ts` and the hand, reaction and recording integration suites (`test:integration-meetings`, `test:integration-recordings`) pass unchanged, including the "feature disabled" refusals.

## 3. Everything else unchanged (D3)

- [x] 3.1 Verify with `git diff` that no other `getMeetRoom` or `findByRoomId` call site changed. In particular, the status transitions, role, access and config updates and deletions in `RoomService` and `RoomMemberService` still read MongoDB.
- [x] 3.2 Make `RoomMemberService.refreshRoomMemberToken` take `config` for the chat grant from the room `verifyRoomMemberToken` returns, instead of reading the room again. Verify with a case in `tests/integration/api/room-members/refresh-room-member-token.test.ts`: a refreshed token gets LiveKit `canPublishData` in a room with chat enabled and not in one with chat disabled.
- [x] 3.3 If `optimize-api-request-hot-path` has landed, make its room permission shortcut test the snapshot (`getRoom(roomId)`) instead of the token's room ID, so both changes share one notion of "this request's room". Verify with that change's `room.middleware.test.ts` cases. Skip this task if that change has not landed.

## 4. Measurement

- [x] 4.1 Repeat the load measurement against the reaction route (`POST /internal-api/v1/meetings/{roomId}/reactions`) with 10 participants at 100 and 300 requests per second, before and after this change, on the same machine. Record backend CPU, MongoDB CPU, and median and p99 latency in the pull request description. Verify that MongoDB CPU at 100 requests per second drops by at least a quarter.

## 5. Release surfaces

- [x] 5.1 Add no `CHANGELOG.md` line. Under the root `CLAUDE.md` rules this is an internal refactor: no request is answered differently. Verify with `git diff --stat CHANGELOG.md`, which is empty.
- [x] 5.2 Change no openvidu.io page: no documented behavior, contract or configuration changes. Verify that the `next` branch of `../openvidu.io` has no change from this work.

## Workflow follow-up

- Archive the change inside the same pull request with `/opsx:archive`. It carries no spec deltas (`skip_specs`).
