# Proposal

## Why

`createApiKey` deletes the current key and then inserts a new one in two separate steps. Two regenerations that overlap, on one replica or on two, can both delete before either inserts, leaving two API keys that are both accepted. A replica starting while a regeneration is in flight can likewise add the `MEET_INITIAL_API_KEY` value next to the new key. The `authentication` spec already requires exactly one key.

## What Changes

- `createApiKey` and the startup seeding of `MEET_INITIAL_API_KEY` replace or add the key while holding one cluster-wide lock, so they run one after the other on any number of replicas and exactly one key remains.
- A regeneration that finds the lock taken waits for it and then runs, so two simultaneous regenerations both answer `201` and the later key is the only one accepted.
- If the lock is still held after the wait budget, `createApiKey` answers `409` saying another API key change is in progress, the pattern webhook registration already follows. The internal OpenAPI of `createApiKey` gains that `409`.
- No spec change: the fix makes the `authentication` requirement "Single API key" pass, scenario "Two replicas regenerate together", and keeps "Initial API key" scenario "Two replicas start together" passing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`): the behavior is already specified in `authentication`.

## Impact

- Internal API: `createApiKey` may answer `409` when the lock cannot be obtained (internal API, no compatibility promise). `getApiKeys` and `deleteApiKeys` unchanged.
- Integrators: requests with the API key never find two valid keys after a regeneration.
- Console UI: the API key section of the Embedded page shows its generic error on that rare `409`; no UI change.
- Deployment configuration: none. Several replicas coordinate through a Redis lock (see design.md).
- REST API, webhooks, embedded API, meeting UI: not affected.
- openvidu.io: no page changes.

## Decisions to confirm

- On lock exhaustion `createApiKey` answers `409` (alternative: `503`, or wait without a budget).
- A waiting regeneration runs after the first one and both answer `201` with the later key winning (alternative: the second one answers `409` immediately without waiting).
