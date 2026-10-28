# Tasks

## 1. Route parameter schemas built once (D1)

- [ ] 1.1 Export a module-level `roomId` parameter schema from `models/zod-schemas/room.schema.ts`, and use it in `withValidRoomId`, `validateDeleteRoomReq` and the recording ID transform in `recording.schema.ts`. Verify with `grep -rn "nonEmptySanitizedRoomId('roomId').safeParse" meet-ce/backend/src`, which finds nothing.
- [ ] 1.2 Export a module-level `recordingId` parameter schema from `models/zod-schemas/recording.schema.ts`, and use it in `withValidRecordingId`. Verify with `grep -rn "nonEmptySanitizedRecordingId('recordingId').safeParse" meet-ce/backend/src`, which finds nothing.
- [ ] 1.3 Verify that an empty, oversized or fully sanitized-away `roomId` and `recordingId` still answer 422 with the same issue path, by running the room and recording integration suites that cover invalid IDs (`test:integration-rooms`, `test:integration-recordings`).

## 2. Room member token validation in parallel (D2)

- [ ] 2.1 In `roomMemberTokenValidator`, start the room, revocation, member and user lookups together. Then apply the existing checks in their existing order, keeping every failure inside the existing `try`/`catch` that answers `errorInvalidToken()`. Verify with the `roomMemberTokenValidator` cases in `tests/unit/middlewares/auth.middleware.test.ts`, which stay green unchanged.
- [ ] 2.2 Add a case to `tests/unit/middlewares/auth.middleware.test.ts` showing that a revoked token is refused even when the room lookup is the slower one. Verify that it fails against an implementation that skips the revocation result and passes against the new one.

## 3. No second room lookup for a token of the same room (D3)

- [ ] 3.1 In `withRoomPermission` and `withRoomPermissionForOthers`, skip `meetRoomExists` when `RequestSessionService.getRoomIdFromMember()` equals `req.params.roomId`. Verify with new cases in `tests/unit/middlewares/room.middleware.test.ts` (the file for that middleware): a room member token of the same room does not look the room up; a token of another room, an access token or an API key still does and still answers 404 for a missing room.
- [ ] 3.2 Verify that permission refusals and missing-room answers are unchanged by running `test:integration-meetings` and `test:integration-rooms` against a local backend that receives LiveKit webhooks (see the backend `CLAUDE.md`).

## 4. Signals sent without an existence check (D4)

- [ ] 4.1 Make `LiveKitService.sendData` call `lk.room.sendData` directly. On an error matching `isNotFoundError`, log the existing "Skipping sending data" warning and return; otherwise throw the existing `internalError`. Verify with new cases in `tests/unit/services/livekit.service.test.ts`: it does not list rooms, it resolves on a Twirp not-found error, and it rejects with 500 on any other error.
- [ ] 4.2 Verify the real LiveKit not-found answer end to end. The integration case that ends a recording after its meeting is gone (`test:integration-recordings`) must keep passing without an error log from `sendData`.

## 5. Static files after the API (D5)

- [ ] 5.1 Move `appRouter.use(express.static(frontendDirectoryPath, { index: false }))` in `server.ts` after the API routers, `/health`, `/info` and the webcomponent bundle routes, and before the SPA catch-all. Verify with a running backend: `curl -I <base>/main-*.js` (any built asset) answers 200 with its file content type; an unknown `/api/v1/x` answers the JSON 404; `/` answers the SPA HTML.
- [ ] 5.2 Verify that the frontend e2e suite (`./meet.sh test-e2e-frontend`) loads the SPA and its lazy chunks through the moved mount.

## 6. Measurement

- [ ] 6.1 Repeat the load measurement against the reaction route (`POST /internal-api/v1/meetings/{roomId}/reactions`) with 10 participants at 100 and 200 requests per second, before and after the change, on the same machine. Record backend CPU, median and p99 latency, and a CPU profile summary in the pull request description. Verify that backend CPU at 100 requests per second drops by at least a quarter and that 200 requests per second runs without timeouts.

## 7. Release surfaces

- [ ] 7.1 Add no `CHANGELOG.md` line. Under the root `CLAUDE.md` rules this is an internal refactor: no request is answered differently, and nothing a user, integrator or operator configures or calls changes. Verify with `git diff --stat CHANGELOG.md`, which is empty.
- [ ] 7.2 Change no openvidu.io page: no documented behavior, contract or configuration changes. Verify that the `next` branch of `../openvidu.io` has no change from this work.

## Workflow follow-up

- Archive the change inside the same pull request with `/opsx:archive`. It carries no spec deltas (`skip_specs`), so archiving only moves it to `openspec/changes/archive/`.
