# Proposal

## Why

A request whose body is corrupt (a compressed body with trailing bytes) or uses an encoding or charset the server does not support answers `500` and writes an error-level log with a stack trace, although the client is at fault. Anyone can send such requests without authentication and fill the error log.

## What Changes

- The error handler answers the body parser's own status (`400` for a body that cannot be decompressed, `415` for an unsupported `Content-Encoding` or charset) for any of its client errors, replacing the switch over two error types by one branch.
- These requests no longer produce an error-level log with a stack.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: undecodable request bodies answer `400` or `415`.

## Impact

- REST API: every operation that takes a body (public and internal) and `/livekit/webhook`; the status of these requests moves from `500` to `400` or `415`. The OpenAPI does not list `500` for them, so the contract does not change.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: `meet-ce/backend/src/middlewares/error-handler.middleware.ts`.
- openvidu.io: none.

## Decisions to confirm

- None: the status is the one the body parser itself reports.

## Source

3.10.0 pre-release audit, finding AU-9 (low, verified-live), introduced by #134.
