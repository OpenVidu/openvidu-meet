# Tasks

## 1. Contract and test wording

- [ ] 1.1 Rewrite the `bytes=1000-` example and the open-ended form in `meet-ce/backend/openapi/recordings/parameters/recording-range.yaml`: at most 5 MiB from `start`, with the served end in `Content-Range`. Verify with `pnpm run lint:api` in `meet-ce/backend` and against `getRecordingAsStream` in `meet-ce/backend/src/services/recording.service.ts`.
- [ ] 1.2 In `meet-ce/frontend/e2e/recordings.test.ts`, remove the comment at line 105 and await the start requests instead of keeping them as swallowed pending promises, wherever the suite does so; rewrite the comment of `stopStartingRecording` in `meet-ce/frontend/e2e/helpers/meet-api.helper.ts` to say the stop answers `202` and the recording ends `aborted`. Verify with `npx tsc --noEmit` on the e2e project and, when the local deployment is available, the recordings e2e suite (Playwright; report as not run otherwise).
- [ ] 1.3 Rename the misnamed format case of `meet-ce/backend/tests/integration/api/recordings/stop-recording.test.ts` to "should return 422 when recordingId is not in the correct format". Verify with `pnpm run test:types` in `meet-ce/backend`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line. Documentation-only and test-only changes get none under the root `CLAUDE.md` rules.
- [ ] 2.2 openvidu.io: regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` on `next` and verify the `Range` description changed.
