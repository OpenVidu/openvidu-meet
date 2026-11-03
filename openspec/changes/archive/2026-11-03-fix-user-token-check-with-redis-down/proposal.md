# Proposal

## Why

When Redis is unreachable, every request that carries a user access token, and `logoutUser`, never answers: the check for revoked tokens waits for Redis without a limit. The console is unusable for the whole outage, its logout button included, and the hung requests pile up until Redis returns. Release 3.9 served these requests without Redis.

## What Changes

- The revocation check, and the writes that record a logout, a password change or an exchanged refresh token, wait for Redis at most about one second, so the request answers instead of hanging.
- When the wait expires or Redis fails, the request answers `503` (decision below): no token that could not be checked is ever accepted. `logoutUser` answers `503` when the end of the session cannot be recorded.
- The console keeps the user's session when the refresh of the access token is answered `503`; it used to sign the user out on any failed refresh.
- The REST API reference gains `503` on every operation that accepts a user access token or the refresh token, and the `503` text names Redis.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication`: requests authenticated with a user access token, and `logoutUser`, answer within a bounded time when Redis is unreachable.

## Impact

- REST API: every operation that accepts a user access token (public and internal), `logoutUser` and `refreshAccessToken` gain a `503` response in the OpenAPI.
- Console UI: requests fail instead of hanging during the outage, and the user is not signed out by a refresh the server could not answer.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: the revocation service of `meet-ce/backend`, the `503` error, a `USER_TOKEN_REVOCATION_TIMEOUT_MS` constant, and the auth error handler of the frontend library.
- openvidu.io: the REST API reference is regenerated.

## Decisions

- Open product question 4, decided with option A (USER, 2026-11-03): fail closed. When Redis cannot say whether a token is revoked the server answers `503`, so no revoked token is ever accepted; the console cannot make authenticated requests during the outage.
- `logoutUser` answers `503` when the revocation cannot be recorded, as under option A of the proposal.

## Source

3.10.0 pre-release audit, finding AU-1 (medium, verified-live), introduced by #130.
