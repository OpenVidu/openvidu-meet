# Tasks

## 1. Bound the revocation read

- [x] 1.1 Decision of open product question 4 recorded in `proposal.md`: fail closed (`503`), `logoutUser` `503` too. Its outcome scenarios are in the delta spec.
- [x] 1.2 In `meet-ce/backend/src/services/user-token-revocation.service.ts`, race every Redis operation of the service (`isRevoked`, `revokeSession`, `revokeIssuedTokens`, `claimRefreshToken`) against `INTERNAL_CONFIG.USER_TOKEN_REVOCATION_TIMEOUT_MS` (1 s) and turn a timeout or a Redis failure into `errorRedisNotAvailable()` (`503`); the access-token validator, `logout` and `refreshToken` pass it through as they already do for a Meet error. Verified with cases in `meet-ce/backend/tests/unit/middlewares/auth.middleware.test.ts` that mock the Redis operation as never settling and use jest fake timers (no real waits).
- [x] 1.3 No integration case: the backend integration suites share Redis with the local deployment, which a test cannot cut; the bounded wait is covered by the unit cases of 1.2.
- [x] 1.4 In `auth-error-handler.service.ts` of the frontend library, keep the session when the refresh of the access token is answered `503` (it signed the user out on any failed refresh), with `auth-error-handler.service.spec.ts`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. The revocation read is new in 3.10.0 (#130), so there is no earlier release it differs from.
- [x] 2.2 Add `503` to every operation of `meet-ce/backend/openapi/` that accepts a user access token or the refresh token (39 operations, `logoutUser` and `refreshAccessToken` included), name Redis in the shared `503` description, and regenerate the REST API reference on openvidu.io (`./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`), committed on `next` and not pushed.
