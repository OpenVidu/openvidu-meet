# Proposal

## Why

Two `createUser` requests for the same `userId` that arrive at the same time, on one replica or on two, both pass the existence check, and the one whose insert loses against the unique `userId` index answers `500` instead of `409`. The `users` spec already states the intended behavior; the code does not meet it.

## What Changes

- `createUser` answers `409` (`User '<userId>' already exists`) whenever the `userId` is taken, including when a concurrent request created it first. The database unique index on `userId` becomes the only check, replacing the read-before-insert that cannot see a concurrent creation.
- No spec change: the fix makes the `users` requirement "Unique user IDs" pass, scenario "Simultaneous creation on two replicas" (scenario "Existing user ID" keeps passing).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`): the behavior is already specified in `users`.

## Impact

- REST API: `createUser` answers the `409` the OpenAPI already lists instead of `500` under a race. No public contract change.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Console UI: not affected (the create-user page shows the same generic failure for any error).
- Several replicas: the unique index lives in the shared MongoDB, so the outcome is the same whichever replica each request reaches; no lock is needed.
- Code: backend persistence layer (duplicate-key error surfaced as a persistence error, like the existing not-found one) and the user service. Integration test in `meet-ce/backend/tests/integration/api/users/create-user.test.ts`.
- openvidu.io: no page changes.
