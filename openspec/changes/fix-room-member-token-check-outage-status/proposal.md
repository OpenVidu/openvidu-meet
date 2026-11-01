# Proposal

## Why

When MongoDB or Redis fails while the server checks a room member token, the server answers `401`, as if the participant's access had been refused. Since the scheduled token renewal relies on that check, a brief database outage can eject a signed-in participant from a meeting, although the meeting is specified to keep them in it when the renewal fails because the server is failing.

## What Changes

- Only token verification and claim parsing answer `401`; a MongoDB or Redis failure while checking credentials answers `500`, which the meeting client retries.
- Unexpected errors in the authentication wrapper answer `500` instead of `401`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication`: a server failure while checking credentials is a `5xx`, never a `401`.

## Impact

- REST API: every operation that validates credentials (public and internal) answers `500` instead of `401` when the server itself fails during the check; the OpenAPI does not change.
- Meeting UI: a participant stays in the meeting during a brief database outage.
- Webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `verifyRoomMemberToken` and `withAuth` in `meet-ce/backend/src/middlewares/auth.middleware.ts`.
- openvidu.io: none.

## Decisions to confirm

- Scope. Proposed: map unexpected errors to `500` in the wrapper that every credential check goes through. Alternative: only the room member token path.

## Source

3.10.0 pre-release audit, finding TK-6 (low, static-high), introduced by #142 (the `401` mapping predates it).
