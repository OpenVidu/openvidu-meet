# Tasks

## 1. Answer the documented body

- [ ] 1.1 In the start path of `meet-ce/backend/src/services/recording.service.ts` map the media server's unreachable error (`livekit.service.ts`, lines 122-134) to `errorRecordingStartRefused(roomId)`, as the other refusal already is. Verify with a new case in `meet-ce/backend/tests/unit/services/recording.service.test.ts` expecting the `Recording Error` body naming the room.
- [ ] 1.2 Add the `500` response of `stopRecording` to `meet-ce/backend/openapi/` and keep `recording-start-unavailable.yaml` as is. Keep `meet-ce/backend/tests/integration/api/recordings/start-recording.test.ts` passing (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (the body is the one the OpenAPI already documents, and the `503` line of 3.10.0 stays true).
- [ ] 2.2 openvidu.io: regenerate the REST API reference with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` on `next`.
