# Tasks

## 1. Skip the notice for a missing room

- [x] 1.1 In `sendRecordingUpdatedSignal` of `meet-ce/backend/src/services/frontend-event.service.ts`, return with a warning when `roomExists` (`livekit.service.ts`) is false before calling `sendSignal`. Verify with cases in `meet-ce/backend/tests/unit/services/frontend-event.service.test.ts`: room missing means no `sendData` call, room present means one.
- [x] 1.2 In `meet-ce/backend/tests/unit/services/livekit.service.test.ts` (lines about 54-63) replace the assumption that LiveKit answers `404` for a missing room with its real answer (`unavailable`, `503`, "no response from servers") and assert what `sendData` does with it.
- [x] 1.3 Add a case to the backend webhook integration tests: an `egress_ended` webhook for a room LiveKit no longer has completes without the multi-second wait (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. The regression was introduced inside the unreleased 3.10.0 (#132), so no release differs from it.
- [x] 2.2 openvidu.io: none.
