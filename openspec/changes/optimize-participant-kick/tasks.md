# Tasks

## 1. One media server call per removal

- [ ] 1.1 In `meet-ce/backend/src/services/livekit.service.ts`, make `deleteParticipant` call `lk.room.removeParticipant` directly: an error matching `isNotFoundError` throws `errorParticipantNotFound`, a `getErrorCauseCode` of `ECONNREFUSED` throws `errorLivekitNotAvailable`, any other error throws `internalError`. Verify with new cases in `meet-ce/backend/tests/unit/services/livekit.service.test.ts`: no participant list is requested, a Twirp not-found answers 404, a refused connection answers 503, any other error answers 500.
- [ ] 1.2 In the same file, make `participantExists` read the participant with `lk.room.getParticipant` instead of listing the room, keeping its answers (`false` for not found, `errorLivekitNotAvailable` for a refused connection). Verify with cases in `livekit.service.test.ts` that no participant list is requested.

## 2. Kick with one read

- [ ] 2.1 Keep `kickParticipant` of `meet-ce/backend/src/services/meeting.service.ts` as `getStandardParticipant` followed by `livekitService.deleteParticipant`, which no longer re-checks existence. Verify with the kick cases of `meet-ce/backend/tests/unit/services/meeting-mute.test.ts` ("kicks a participant of the meeting", "answers a kick of a recorder or an agent with a 404 and disconnects nobody"), unchanged and green.
- [ ] 2.2 Run `meet-ce/backend/tests/integration/api/meetings/kick-participant.test.ts` (backend integration suite, needs the OpenVidu local deployment; report as not run when unavailable): kick, rejoin after a kick, unknown identity 404 and recorder 404 keep passing. Run `./meet.sh test-unit-backend` and `./meet.sh lint-backend`.

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: no line. Under the root `CLAUDE.md` rules this is a performance change without an observable difference for any client.
- [ ] 3.2 openvidu.io: none.
