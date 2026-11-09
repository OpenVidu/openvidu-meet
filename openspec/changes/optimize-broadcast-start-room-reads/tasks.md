# Tasks

Paths are relative to `meet-ce/backend/`.

## 1. One read per start

- [ ] 1.1 Add a repository method that returns `roomName`, `config` and `broadcastDestinationUrls` of a room in one query, and make `startBroadcasts` in `src/services/broadcast.service.ts` use it and throw `errorBroadcastDisabled` when `config.broadcast.enabled` is false.
- [ ] 1.2 Delete `withBroadcastEnabled` from `src/middlewares/broadcast.middleware.ts` and its use in `src/routes/broadcast.routes.ts`. Verify in `tests/unit/services/broadcast.service.test.ts`: one repository read per start, and a disabled room answers `403` `Broadcast Error`; in `tests/integration/api/meetings/broadcasts.test.ts` the `403` still comes before `409` and `422` (needs the OpenVidu local deployment; report as not run when unavailable). Run `./meet.sh test-unit-backend` and `./meet.sh lint-backend`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none, no observable change.
- [ ] 2.2 openvidu.io: none.
