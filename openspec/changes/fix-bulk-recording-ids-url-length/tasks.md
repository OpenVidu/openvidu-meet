# Tasks

## 1. Lower the cap for the recording operations

- [ ] 1.1 In `meet-ce/backend/src/config/internal-config.ts` (line 85) give `bulkDeleteRecordings` and `downloadRecordings` their own cap of 60 and leave `bulkDeleteRooms` at 100. Measure the longest ZIP URL (60 ids of 95 characters, both tokens) and confirm it is under 8 KB. Verify with updated cases in `meet-ce/backend/tests/integration/api/recordings/bulk-delete-recording.test.ts` and `download-recordings.test.ts` (61 ids answer `422`) and the unchanged `meet-ce/backend/tests/unit/models/bulk-delete-rooms-cap.test.ts` (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).
- [ ] 1.2 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/recordings/services/recording.service.ts` (lines 285-315) and the lists that disable ZIP and bulk delete, use 60 and the explanation text of the limit in the translation bundles (10 languages). Verify with the cases of `meet-ce/frontend/e2e/recordings.test.ts` about the limit (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 Update the `422` number in the 100-id descriptions of the two operations in `meet-ce/backend/openapi/`.
- [ ] 2.2 Amend the existing `CHANGELOG.md` line under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` ("They now accept up to 100 distinct ids ... beyond 100 selected recordings") to say 60. No new line.
- [ ] 2.3 openvidu.io: regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` on `next`.
