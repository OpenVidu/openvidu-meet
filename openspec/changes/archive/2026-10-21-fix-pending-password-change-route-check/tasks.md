# Tasks

## 1. Admit a pending password change per route

- [x] 1.1 Give `accessTokenValidator` a way for a route to admit a user with a pending password change or a temporary token (for example an option, or a dedicated validator built on it), use it only on the `getMe` and `changeUserPassword` routes in `meet-ce/backend/src/routes/user.routes.ts`, and delete the `req.path` comparison in `auth.middleware.ts`; verify `pnpm run lint` and `pnpm run test:types` pass in `meet-ce/backend`.
- [x] 1.2 Update the two pending-password tests in `meet-ce/backend/tests/unit/middlewares/auth.middleware.test.ts` so the admitting validator lets `mustChangePassword` users and temporary tokens through, and the default validator refuses them with `403` even for a request whose router-relative path is `/me` or `/change-password`; verify with `pnpm run test:unit`.
- [x] 1.3 Add to the pending-password-change block of `meet-ce/backend/tests/integration/api/auth/token-validation.test.ts` a case where a user with `mustChangePassword` and a temporary token call `GET /api/v1/users/me` and `GET /api/v1/rooms/me` and get `403` with the password-change-required message, while `getMe` and `changeUserPassword` keep answering `200`; verify with `pnpm run test:integration-auth` (needs the local deployment; report as not run otherwise).

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "The access token of a user with a pending password change also reached public endpoints whose path ends in `/me` or `/change-password`, such as `GET /api/v1/users/me`. Only `getMe` and `changeUserPassword` accept it now."; verify it follows the root `CLAUDE.md` changelog rules.
- [x] 2.2 openvidu.io: none (`docs/meet/features/users/management.md` already says the temporary password is changed before using Meet).
