# Tasks

## 1. Server marks the root admin

- [x] 1.1 Add `isRootAdmin` to `MeetUserDTO` in `meet-ce/typings/src/response/user-response.ts` with its TSDoc, and set it in `UserService.convertToDTO` from `MEET_ENV.INITIAL_ADMIN_USER`; verify `./meet.sh build-typings` and `pnpm run test:types` in `meet-ce/backend` pass.
- [x] 1.2 Add `isRootAdmin` to the `MeetUser` schema in `meet-ce/backend/openapi/users/schemas/meet-user.yaml` and its examples, and verify `pnpm run lint:api` passes.
- [x] 1.3 Assert the field in `meet-ce/backend/tests/integration/api/users/get-user.test.ts` (root admin `true`, another user `false`) and in `get-users.test.ts` (only the root admin row is `true`); verify with `pnpm run test:integration-users` (needs the local deployment; report as not run otherwise).

## 2. Console reads the field

- [x] 2.1 Replace `UsersUiUtils.isRootAdmin`/`isProtectedUser` inputs with `user.isRootAdmin`, delete `UserService.getRootAdmin()` and the `rootAdminId` plumbing in the users list, users page and profile page of `shared-meet-components` (`domains/users`); verify `pnpm run lint` and `pnpm run lib:build` pass in `meet-ce/frontend`.
- [x] 2.2 Add to `meet-ce/frontend/e2e/console.test.ts` a Users page case that intercepts `getUsers` (Playwright `page.route`) to return an older `admin` account with `isRootAdmin` `false` and a newer `root_admin` with `isRootAdmin` `true`, and asserts that only the `root_admin` row is marked and protected; verify with `pnpm run e2e:playwright:spa` (needs the local deployment).

## 3. Release surfaces

- [x] 3.1 Add to `CHANGELOG.md` under `## 3.10.0 (unreleased)`: in `### Added` -> `#### Integration`, "User responses carry `isRootAdmin`, `true` for the `MEET_INITIAL_ADMIN_USER` account."; in `### Fixed` -> `#### UI`, "The console treated the earliest registered user as the root admin, so after a change of `MEET_INITIAL_ADMIN_USER` it protected the wrong account. It now protects the `MEET_INITIAL_ADMIN_USER` account."; verify both follow the root `CLAUDE.md` changelog rules.
- [x] 3.2 openvidu.io `next`: in `docs/meet/features/users/overview.md`, section "Root administrator", replace the fixed `userId` `admin` with the account named by `MEET_INITIAL_ADMIN_USER` (default `admin`), and say other administrators cannot delete it, change its role or reset its password; verify with the site's lint (`check-web`).
- [ ] 3.3 Regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` and verify `isRootAdmin` appears in the `MeetUser` schema of the generated page.
