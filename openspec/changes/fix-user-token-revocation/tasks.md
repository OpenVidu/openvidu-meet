# Tasks

## 1. Session identifiers and the revocation service

- [ ] 1.1 Add the optional `sid` and `rid` fields to `TokenMetadata` and `TokenMetadataSchema`, mint a `sid` in `loginUser` and `changeUserPassword`, keep it across `refreshAccessToken`, and give every refresh token a fresh `rid`; verify with cases in `meet-ce/backend/tests/unit/services/token.service.test.ts` (tokens from one login share the `sid`, refresh tokens get distinct `rid`s, metadata without them still parses).
- [ ] 1.2 Add the three Redis key names to `RedisKeyName` and a user-token revocation service bound in the DI container, with TTLs taken from the token lifetimes; verify its revoke/claim/check behavior with cases in `meet-ce/backend/tests/unit/middlewares/auth.middleware.test.ts` through the access token validator, and `pnpm run test:unit`.

## 2. Logout ends the session

- [ ] 2.1 Make `logoutUser` verify the access or refresh token it receives, if any, revoke its session, and answer `200` in every case; reject a revoked session in `accessTokenValidator` (`401` `Invalid token`) and in `refreshAccessToken` (`400` `Invalid refresh token`); verify in `meet-ce/backend/tests/integration/api/auth/logout.test.ts` that after logout the access token answers `401` on `getMe`, the refresh token `400`, and a second login session of the same user still works (`pnpm run test:integration-auth`, needs the local deployment; report as not run otherwise).
- [ ] 2.2 Update the `logoutUser` description in `meet-ce/backend/openapi/auth/` and verify `pnpm run lint:api` passes.

## 3. Password change revokes earlier tokens

- [ ] 3.1 In `changeUserPassword`, record the revocation instant for the user and always return a new `accessToken` and `refreshToken`; reject access and refresh tokens issued before it; verify in `meet-ce/backend/tests/integration/api/users/change-password.test.ts` that the tokens of another login answer `401`/`400` after the change, the returned tokens are accepted, and the forced change still returns its tokens (`pnpm run test:integration-users`).
- [ ] 3.2 Update the `changeUserPassword` response in `meet-ce/backend/openapi/users/internal/` so the tokens are always present, and verify `pnpm run lint:api` passes.
- [ ] 3.3 Store the returned tokens after a voluntary change in the console profile page of `shared-meet-components` (`domains/users`), and verify with a profile password-change case added to `meet-ce/frontend/e2e/console.test.ts` that the user stays signed in and can keep navigating (`pnpm run e2e:playwright:spa`, needs the local deployment).

## 4. Rotated refresh tokens are single use

- [ ] 4.1 Claim the refresh token's `rid` in `refreshAccessToken` before rotating, answering `400` `Invalid refresh token` when the claim fails; leave rotation-off behavior unchanged; verify in `meet-ce/backend/tests/integration/api/auth/refresh-token.test.ts` that a reused rotated token answers `400`, two parallel refreshes with one token give one `200` and one `400`, and with rotation disabled (the `MEET_ENV.REFRESH_TOKEN_ROTATION_ENABLED` override the file already uses) the token can be reused (`pnpm run test:integration-auth`).
- [ ] 4.2 Make the console auth error handler share one in-flight refresh among concurrent `401`s and retry a `400` refresh once with the refresh token in browser storage when it differs from the one sent; verify in `meet-ce/frontend/e2e/token-refresh.test.ts` that a page whose requests all expire together sends one `refreshAccessToken` and stays signed in, and that two tabs expiring together both stay signed in (`pnpm run e2e:playwright:spa`, needs the local deployment).
- [ ] 4.3 Update the `refreshAccessToken` `400` description in `meet-ce/backend/openapi/auth/` and verify `pnpm run lint:api` passes.

## 5. Release surfaces

- [ ] 5.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md` one line: "Logging out, changing one's own password and refreshing with rotation left the earlier user tokens valid until they expired. `logoutUser` now revokes the session's tokens, `changeUserPassword` revokes every earlier token of the user and returns new ones, and a rotated refresh token is accepted once."; verify it follows the root `CLAUDE.md` changelog rules.
- [ ] 5.2 openvidu.io `next`: in the "Changing your password" section of `docs/meet/features/users/management.md`, add that the change signs out every other session of the user while the current one stays signed in; verify with the site's lint (`check-web`).
