# Tasks

## 1. Keep `401` for credential refusals

- [x] 1.1 In `verifyRoomMemberToken` of `meet-ce/backend/src/middlewares/auth.middleware.ts` (about lines 240-286) keep only `verifyToken` and the claim parsing inside the `try` that answers `401`, and let repository and Redis errors propagate; in `withAuth` (about lines 80-90) map errors that are not Meet errors to `500`. Verify in `meet-ce/backend/tests/unit/middlewares/auth.middleware.test.ts`: a rejecting repository gives `500`, a malformed token gives `401`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`: "A request whose credentials could not be checked because the database or Redis failed answered `401`. It now answers `500`."
- [x] 2.2 openvidu.io: none.
