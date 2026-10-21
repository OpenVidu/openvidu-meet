# Proposal

## Why

While a user has a pending password change, or holds the temporary token issued for one, their access token must reach only `getMe` and `changeUserPassword`. The server decides that by comparing the path relative to the router that handles the request with `/me` and `/change-password`, so any endpoint whose own route happens to end that way also lets the token through: `GET /api/v1/users/me` (handled as `getUser` for `userId` `me`) or `GET /api/v1/rooms/me` reach the role check and the handler instead of answering `403`.

## What Changes

- Only the two operations `getMe` and `changeUserPassword` admit a user with a pending password change; the two routes declare it themselves instead of the access token check matching request paths. Every other endpoint that takes an access token answers `403` with the password-change-required message, whatever its path.
- No spec change: the fix makes the `users` requirement "Forced password change" hold for every endpoint, scenario "Pending user blocked elsewhere" (and the `authentication` requirement "Temporary token for a pending password change").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`): the behavior is already specified in `users` and `authentication`.

## Impact

- REST API: a pending user's request to a public endpoint whose path ends in `/me` or `/change-password` answers `403` instead of reaching the endpoint (today it answers `404` or `403` from the endpoint itself). No public contract change; the OpenAPI already lists `403` on those endpoints.
- Internal API: `getMe` and `changeUserPassword` unchanged.
- Console UI, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: backend auth middleware and the internal user routes; unit test in `meet-ce/backend/tests/unit/middlewares/auth.middleware.test.ts`, integration test in `meet-ce/backend/tests/integration/api/auth/token-validation.test.ts`.
- openvidu.io: no page changes.

## Decisions to confirm

- A pending user calling `GET /api/v1/users/me` or `GET /api/v1/rooms/me` gets `403` (password change required) instead of the endpoint's own answer (alternative: keep the path match and only make it compare full paths).
