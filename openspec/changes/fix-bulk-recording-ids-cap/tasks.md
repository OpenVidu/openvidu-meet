# Tasks

## 1. Cap recordingIds on the server

- [ ] 1.1 In `meet-ce/backend/src/models/zod-schemas/recording.schema.ts`, deduplicate `recordingIds` and cap them at `INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS` with the message shape of `roomIds`. Verify with new cases in `meet-ce/backend/tests/integration/api/recordings/bulk-delete-recording.test.ts` (101 ids answer `422`, a repeated id is deleted once) and `download-recordings.test.ts` (101 ids answer `422`) (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).
- [ ] 1.2 State the limit in `meet-ce/backend/openapi/recordings/parameters/recording-ids.yaml` ("at most 100 distinct ids per request; more are rejected with `422`") and verify with `pnpm run lint:api` in `meet-ce/backend`.

## 2. App bulk actions respect the limit

- [ ] 2.1 In the recording list component of `shared-meet-components` (`domains/recordings/components/recording-lists/`), disable ZIP download and bulk delete when more than 100 recordings are selected, with a translated tooltip in every locale file. Verify with a Karma spec next to the component, or extend `domains/recordings/services/recording-actions.service.spec.ts` if the gate lives there.

## 3. Release surfaces

- [ ] 3.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` of `CHANGELOG.md`: "[`bulkDeleteRecordings`][3.9-bulk-delete-recordings] and [`downloadRecordings`][3.9-download-recordings] accepted any number of `recordingIds`, and a long list failed with a server or proxy error. They now accept up to 100 distinct ids and answer `422` to more." Add the references `[3.9-bulk-delete-recordings]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/bulkDeleteRecordings` and `[3.9-download-recordings]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/downloadRecordings`.
- [ ] 3.2 openvidu.io: regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` on `next` and verify the `recordingIds` description shows the limit; no feature page changes.
