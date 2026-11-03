# Tasks

## 1. Refuse tokens without rotation identity

- [ ] 1.1 In `refreshToken` of `meet-ce/backend/src/controllers/auth.controller.ts`, when rotation is enabled reject a refresh token without `rid` or `sid` with the existing invalid-refresh-token error, and delete the `metadata.rid &&` guard and the `metadata.sid ?? createSessionId()` fallback. Verify with cases in `meet-ce/backend/tests/integration/api/auth/` (the existing refresh test file) that sign a 3.9-format token with the deployment key (needs the OpenVidu local deployment; report as not run when unavailable).
- [ ] 1.2 Check the console login flow handles the `400` by going to the login page (library auth error handler); no change expected.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: add under `### Upgrade notes` of `## 3.10.0 (unreleased)`: "Users signed in with an earlier version sign in again once: refresh tokens issued before 3.10 are no longer accepted." No `Fixed` line: it makes the existing line "a rotated refresh token is accepted once" true.
- [ ] 2.2 openvidu.io: none.
