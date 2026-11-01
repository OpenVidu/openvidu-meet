# Proposal

## Why

When Meet stops at startup because one initial item cannot be created (for example a `MEET_INITIAL_ADMIN_USER` that is too short), it exits while holding the API key lock for 5 seconds, longer than the lock's wait budget of about 2 seconds. A restart within 5 seconds then fails with a lock error instead of starting or reporting the real configuration error, and `createApiKey` can answer `409` for up to 5 seconds.

## What Changes

- Startup waits for every seeder to finish, and so to release its locks, before it aborts with the first failure.
- The API key lock's wait budget (attempts times delay) exceeds its time to live, as the storage initialization lock already does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: a failed start releases the seeding locks, and a restart right after it starts or fails with its own error.

## Impact

- Deployment: startup behavior after a failed start; no configuration or contract change.
- REST API: `createApiKey` waits for a lock left by a dead replica instead of answering `409`; the documented responses do not change.
- Webhooks, embedded API, meeting UI, console UI: not affected.
- Code: `storage-init.service.ts`, `api-key.service.ts` and the lock constants of `internal-config.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- None: both changes follow the storage initialization lock, which already waits longer than its time to live.

## Source

3.10.0 pre-release audit, finding AU-2 (low, verified-live), introduced by #130.
