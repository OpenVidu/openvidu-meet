# Tasks

## 1. Reword the refusal

- [ ] 1.1 In `meet-ce/backend/src/models/error.model.ts` change the message of `errorEgressNotAvailable` to "No egress service could take the request (none running or none with capacity)". Update `meet-ce/backend/openapi/shared/responses/errors/egress-unavailable.yaml` and the case in `meet-ce/backend/tests/unit/services/livekit.service.test.ts` that asserts the text. The integration suites `broadcasts.test.ts` and `start-recording.test.ts` compare against the same factory, so they need no edit; run them when the OpenVidu local deployment is available, otherwise report as not run.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. Live broadcast (#120) and the `503` of `startRecording` are new in 3.10.0 and unreleased.
- [ ] 2.2 openvidu.io: in `docs/meet/features/meetings/live-broadcast.md` (next branch) state that recording and broadcasting at once use two video compositors, and a node without capacity for both refuses the second.
