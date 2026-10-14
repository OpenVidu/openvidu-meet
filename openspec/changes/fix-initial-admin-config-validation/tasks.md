# Tasks

## 1. Validate the root admin configuration

- [ ] 1.1 In `UserService.initializeAdminUser`, throw an error naming `MEET_INITIAL_ADMIN_USER` when it is shorter than the login minimum, and one naming `MEET_INITIAL_ADMIN_PASSWORD` when the account is missing and the password is shorter, so storage initialization fails and startup exits with a non-zero status as it already does for a seeding failure; take the minimum from the login schema in `auth.schema.ts` instead of repeating the number, and leave an existing account untouched whatever the password variable holds. Verify with `pnpm run test:unit`.
- [ ] 1.2 Add to `meet-ce/backend/tests/unit/services/storage-init.service.test.ts` (the seeding domain) cases for `initializeAdminUser` with a fake user repository: short user ID rejects, missing account plus short password rejects without creating the account, existing account plus short password resolves and creates nothing; verify with `pnpm run test:unit`.
- [ ] 1.3 Run `pnpm run lint` and `pnpm run test:types` in `meet-ce/backend` and verify both pass.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Deployment` of `CHANGELOG.md`: "A `MEET_INITIAL_ADMIN_USER` or `MEET_INITIAL_ADMIN_PASSWORD` shorter than 5 characters created a root admin that could never log in. Meet now refuses to start with such a value and names the variable."; if the upgrade-notes decision is confirmed, also add under `### Upgrade notes`: "Meet no longer starts when `MEET_INITIAL_ADMIN_USER` is shorter than 5 characters."; verify both follow the root `CLAUDE.md` changelog rules.
- [ ] 2.2 openvidu.io `next`: in `docs/docs/self-hosting/configuration/reference.md`, state in the `MEET_INITIAL_ADMIN_USER` and `MEET_INITIAL_ADMIN_PASSWORD` rows that each must be at least 5 characters long; verify with the site's lint (`check-web`).
