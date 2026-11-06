# Proposal

## Why

A request whose path holds a percent escape that does not decode, such as `GET /api/v1/broadcasts/%E0%A4%A`,
`/api/v1/rooms/%ZZ` or `/api/v1/users/%`, answers `500 Internal Server Error` and writes an error-level log with a
stack trace, although the client sent a malformed URL. It happens on every route with a path parameter, public and
internal, before the credentials are checked, so anyone can fill the error log. The router already flags the
failure as a `400`, but the global error handler only recognizes the body parser's client errors and masks the
rest as `500`. It also contradicts `live-broadcast`, which answers `422` to a malformed `broadcastId`, not `500`.

Found by the 2026-11-06 black-box probe of the 3.10 features; reproduced on `main` and on `v3.9.0`.

## What Changes

- The server answers `400` with error `Bad Request` and message `Malformed path` to a path parameter that does not
  percent-decode, on any route, and no longer logs it as an unexpected failure.
- A well-formed escape, such as `%20`, keeps decoding as before.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: a new requirement "Undecodable request paths", next to "Request body limit" and "Unexpected errors
  are masked".

## Impact

- REST API (public and internal): such requests move from `500` to `400`. The OpenAPI does not list `500` for them,
  so no contract changes.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: the global error handler in `meet-ce/backend/src/middlewares/error-handler.middleware.ts`.
- Related: `fix-malformed-request-body-status` (AU-9) does the same for bodies the parser cannot decode; the two
  are independent and touch different branches of the same handler.
- openvidu.io: none.
