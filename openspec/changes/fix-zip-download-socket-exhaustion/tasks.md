# Tasks

## 1. Stream the ZIP sequentially and release it on abort

- [ ] 1.1 In `createRecordingsZipArchive` (`meet-ce/backend/src/services/recording.service.ts`, lines 430-465), stop opening every recording stream through `runConcurrently` before returning: return the archive at once and append each recording's stream only after the previous entry is written, removing the up-front concurrent open. Verify with a new case in `meet-ce/backend/tests/unit/services/recording.service.test.ts`: with 60 recordings, at most one stream is open at a time.
- [ ] 1.2 In the ZIP route of `meet-ce/backend/src/controllers/recording.controller.ts` (lines 298-313), on the response `close` event abort the archive and destroy the open stream. Verify with a unit case that a closed response destroys the stream.
- [ ] 1.3 Add to `meet-ce/backend/tests/integration/api/recordings/download-recordings.test.ts` a ZIP of 51 recordings, and a cancelled ZIP followed by a media request that must answer (backend integration suite, needs the OpenVidu local deployment with S3; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration` of `CHANGELOG.md`: "[`downloadRecordings`][3.9-download-recordings] with more than 50 recordings, two large ZIPs at once or a cancelled ZIP left every later playback and download of the server hanging until it restarted. Each ZIP now releases what it opened, whatever its size or how it ends." Verify the reference `[3.9-download-recordings]` exists at the end of the file.
- [ ] 2.2 openvidu.io: none.
