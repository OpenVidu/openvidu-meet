# Tasks

## 1. Serialize API key creation

- [ ] 1.1 Add `RedisLockName.API_KEY`, `MeetLock.getApiKeyLock()` and the lock TTL, retry delay and attempts to `INTERNAL_CONFIG`; verify `pnpm run lint` and `pnpm run test:types` pass in `meet-ce/backend`.
- [ ] 1.2 Run `ApiKeyService.createApiKey` (delete all keys, then insert) and `ApiKeyService.initializeApiKey` inside `withRetryLock` on that lock, throwing a new `409` error from `error.model.ts` when the lock is not obtained; verify with a test in `meet-ce/backend/tests/integration/api/api-keys/create-api-key.test.ts` that two parallel `createApiKey` requests both answer `201`, `getApiKeys` then returns exactly one key, it equals one of the two returned keys, and only that key is accepted (`pnpm run test:integration-api-keys`, needs the local deployment; report as not run otherwise).
- [ ] 1.3 Cover the lock-taken path in the same file by holding the API key lock through `MutexService` while calling `createApiKey` with a reduced retry budget (`setInternalConfig`), expecting `409`; verify with `pnpm run test:integration-api-keys`.
- [ ] 1.4 Add the `409` response to `createApiKey` in `meet-ce/backend/openapi/api-keys/api-keys.yaml` and verify `pnpm run lint:api` passes.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "Two simultaneous API key regenerations could leave two API keys, both accepted. Exactly one remains now, the last one generated."; verify it follows the root `CLAUDE.md` changelog rules.
- [ ] 2.2 openvidu.io: none (no page describes regenerating the key concurrently).
