# Tasks

## 1. Storage

- [ ] 1.1 Add `publicPlay` and `privatePlay` to `accessSecrets` in the recording Mongoose schema and document type, create them with the other two in `RecordingRepository`, and have `getRecordingAccessSecrets` return the four. Recording migration v3 → v4 adds them to existing documents, with `RECORDING_SCHEMA_VERSION` bumped and its `MIGRATION_REV` refreshed per `meet-ce/backend/src/migrations/README.md` (design D4). The existing integration test `meet-ce/backend/tests/integration/api/recordings/recording-migrations.test.ts` shows a v3 document gaining both secrets and keeping its two. Verify with `pnpm run test:unit` and `pnpm run test:types` in `meet-ce/backend`.

## 2. Server

- [ ] 2.1 `setupRecordingAuthentication` resolves the secret to its scope and to whether it grants download, records both for the request, and `authorizeRecordingAccess(permission, true)` waives `recordingDownload` only for a secret that grants it, answering `403` to a play-only secret without falling through to the caller's permissions (design D2). Covered by the integration tests of 2.4, which reach every secret on play and download.
- [ ] 2.2 `getRecordingUrl` returns the play-only secret of the requested scope when the caller lacks `recordingDownload`, the current one otherwise (design D2).
- [ ] 2.3 Internal `GET /internal-api/v1/recordings/{recordingId}/link?recordingSecret=...` answering `{ download: boolean }` after the same secret checks as `getRecording` (design D3), documented in the internal OpenAPI.
- [ ] 2.4 Integration tests in the existing `meet-ce/backend/tests/integration/api/recordings/get-recording-url.test.ts` and `meet-ce/backend/tests/integration/api/security/recording-security.test.ts`, the scenarios of "Shareable recording links" and "Access with a recording secret": a member token with `recordingPlay` and without `recordingDownload` gets a link whose secret plays and whose download answers `403`, public and private; an API key, an `admin` user and the owner get links that download; the current secrets keep downloading; the internal read answers `download` for each secret. The play-only tests fail against the code before 2.2. Run against an isolated backend (own `MEET_MONGO_DB_NAME` and `MEET_REDIS_DB`), or report them as not run.
- [ ] 2.5 OpenAPI `meet-ce/backend/openapi/recordings/`: `getRecordingUrl` says the link downloads only when the caller holds `recordingDownload`; `downloadRecording` and the `recordingSecret` parameter say a play-only secret does not download. Verify with `pnpm run lint:api` in `meet-ce/backend`.

## 3. Frontend

- [ ] 3.1 The recording view page asks the internal read once when it has a secret and offers download from its answer instead of from the presence of a secret (design D3). Karma spec of the page: a play-only secret hides download, a play-and-download secret shows it, a member's own `recordingDownload` shows it. Verify with `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.
- [ ] 3.2 SPA end-to-end, in the existing `meet-ce/frontend/e2e/recordings.test.ts`: a member with `recordingPlay` but not `recordingDownload` shares a recording, and the link opened in a fresh context plays it with no download offered. Run against an isolated backend, or report it as not run.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`, 3.10.0, `Fixed`, `Integration`: "[`getRecordingUrl`][3.10-get-recording-url] returned a link that downloads the recording to a caller holding `recordingPlay` without `recordingDownload`. Such a caller now gets a link that plays the recording without downloading it; links shared before keep working." with a reference-style 3.10 definition to `#/operations/getRecordingUrl`.
- [ ] 4.2 openvidu.io `next`, `docs/meet/features/recordings/management.md`, "Sharing recordings": a link created by someone without the download permission plays the recording but does not offer to download it.
- [ ] 4.3 Regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`.
- [ ] 4.4 `npx openspec validate recording-url-within-own-permissions --strict`.

## Workflow follow-up

- Archive inside the pull request that implements it (`/opsx:archive`), before merging.
