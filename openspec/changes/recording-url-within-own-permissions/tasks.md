# Tasks

## 1. Storage

- [ ] 1.1 Add `publicPlay` and `privatePlay` to `accessSecrets` in the recording Mongoose schema and document type, create them with the other two in `RecordingRepository`, and have `getRecordingAccessSecrets` return the four. Recording migration v3 → v4 adds them to existing documents, with `RECORDING_SCHEMA_VERSION` bumped and its `MIGRATION_REV` refreshed per `meet-ce/backend/src/migrations/README.md` (design D4). The existing integration test `meet-ce/backend/tests/integration/api/recordings/recording-migrations.test.ts` shows a v3 document gaining both secrets, distinct from those of another document, and keeping its two. Verify with `pnpm run test:unit` and `pnpm run test:types` in `meet-ce/backend`.

## 2. Server

- [ ] 2.1 `setupRecordingAuthentication` takes the permission its route serves (`recordingPlay` on `getRecording` and `getRecordingMedia`, `recordingDownload` on `downloadRecording`) and answers `403` with the insufficient-permissions error when it recognises a play-only secret on the download route, in the `switch` that matches the secret (design D2). `authorizeRecordingAccess` stays as it is. Covered by the integration tests of 2.4, which reach every secret on play and download.
- [ ] 2.2 `getRecordingUrl` reads the caller's permissions with `RoomAccessService.getAuthenticatedRoomMemberPermissions` and gets from `generateRecordingUrl` the play-only secret of the requested scope when they lack `recordingDownload`, the current one otherwise (design D2).
- [ ] 2.3 Internal `GET /internal-api/v1/recordings/{recordingId}/link?recordingSecret=...` answering `{ download: boolean }` after the same secret checks as `getRecording` (design D3), documented in the internal OpenAPI.
- [ ] 2.4 Integration tests in the existing `meet-ce/backend/tests/integration/api/recordings/get-recording-url.test.ts` and `meet-ce/backend/tests/integration/api/security/recording-security.test.ts`, the scenarios of "Shareable recording links", "Access with a recording secret" and "Downloading a recording": a member token with `recordingPlay` and without `recordingDownload` gets a link whose secret plays and whose download answers `403`, public and private, also when the download request carries an API key; an API key, an `admin` user and the owner get links that download; the current secrets keep downloading; the internal read answers `download` for each secret and `400`/`401`/`403` like `getRecording`. The play-only tests fail against the code before 2.2. Run against an isolated backend (own `MEET_MONGO_DB_NAME` and `MEET_REDIS_DB`), or report them as not run.
- [ ] 2.5 OpenAPI `meet-ce/backend/openapi/recordings/`: `getRecordingUrl` says the link downloads only when the caller holds `recordingDownload`; `downloadRecording` and the `recordingSecret` parameter say a play-only secret does not download. Verify with `pnpm run lint:api` in `meet-ce/backend`.

## 3. Frontend

- [ ] 3.1 `RecordingEntryService.validate` checks a secret with the internal read instead of `getRecording` and keeps its `download` answer; the recording view page offers download from that answer when the visit brings a secret, and from `recordingDownload` otherwise (design D3). Karma specs of `RecordingEntryService` and of the page: a play-only secret hides download, also for a member holding `recordingDownload`; a play-and-download secret shows it; without a secret, a member's `recordingDownload` shows it. Verify with `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.
- [ ] 3.2 The recording player cancels the `contextmenu` event of its video and keeps `controlsList="nodownload"` (design D6). Karma spec in the existing `recording-video-player.component.spec.ts`: a `contextmenu` event dispatched on the video comes back with `defaultPrevented`.
- [ ] 3.3 SPA end-to-end, in the existing `meet-ce/frontend/e2e/recordings.test.ts`: a member with `recordingPlay` but not `recordingDownload` shares a recording, and the link opened in a fresh context plays it with no download offered; a `contextmenu` event on the video of the console recording detail page and of the recording view page comes back with `defaultPrevented`. Run against an isolated backend, or report it as not run.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`, 3.10.0, `Fixed`, `Integration`: "[`getRecordingUrl`][3.10-get-recording-url] returned a link that downloads the recording to a caller holding `recordingPlay` without `recordingDownload`, and the recording player's context menu saved the video for any viewer. Such a caller now gets a link that only plays the recording, and the player opens no context menu." with a reference-style 3.10 definition to `#/operations/getRecordingUrl`.
- [ ] 4.2 openvidu.io `next`, `docs/meet/features/recordings/management.md`, "Sharing recordings": a link created by someone without the download permission plays the recording but does not offer to download it.
- [ ] 4.3 Regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`.
- [ ] 4.4 `npx openspec validate recording-url-within-own-permissions --strict`.

## Workflow follow-up

- Archive inside the pull request that implements it (`/opsx:archive`), before merging.
