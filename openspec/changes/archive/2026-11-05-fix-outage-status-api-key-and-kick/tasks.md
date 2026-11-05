# Tasks

## 1. Propagate the read failure

- [x] 1.1 Drop the catch-all around `getApiKeys()` in `ApiKeyService.validateApiKey()` and
  `WebhookDispatcherService.getApiKey()`. Covered by `tests/unit/services/api-key.service.test.ts` and the
  `apiKeyValidator` case in `tests/unit/middlewares/auth.middleware.test.ts`.

- [x] 1.2 `LiveKitService.participantExists()`: list participants from the LiveKit client, not through
  `listRoomParticipants()`, which drops the error cause. Covered by `tests/unit/services/livekit.service.test.ts`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: the API key case is stated by the 3.10.0 Fixed line "A request whose credentials could not be
  checked..."; the kick gets a line under `### Fixed` > `#### Integration`.
- [x] 2.2 openvidu.io: none.
