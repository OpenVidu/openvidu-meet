# Tasks

## 1. Duplicate user ID answers 409

- [x] 1.1 Surface a MongoDB duplicate-key error (code `11000`) from `BaseRepository.createDocument` as a persistence-layer error with no HTTP status, alongside `DocumentNotFoundError` in `meet-ce/backend/src/models/database.model.ts`, rethrowing every other error unchanged; verified by task 1.3.
- [x] 1.2 In `UserService.createUser`, drop the `findByUserId` pre-check and map that persistence error to `errorUserAlreadyExists`; verify the existing "duplicate userId" test in `meet-ce/backend/tests/integration/api/users/create-user.test.ts` still answers `409`.
- [x] 1.3 Add to `create-user.test.ts` a test that fires two `createUser` requests for the same new `userId` in parallel and expects one `201`, one `409` with `User '<userId>' already exists`, and exactly one account afterwards; verify it with `pnpm run test:integration-users` (needs the local deployment; report as not run otherwise).
- [x] 1.4 Run `pnpm run lint` and `pnpm run test:types` in `meet-ce/backend` and verify both pass.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "Two simultaneous [`createUser`][3.10-create-user] requests with the same `userId` could answer `500`. The one that finds the `userId` taken now answers `409`." with the reference definition `[3.10-create-user]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/createUser`; verify the line follows the root `CLAUDE.md` changelog rules.
- [x] 2.2 openvidu.io: none (no page describes this race).
