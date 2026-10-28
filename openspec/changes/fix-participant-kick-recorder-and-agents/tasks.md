# Tasks

## 1. Kick only standard participants

- [x] 1.1 Make the kick path resolve the participant through the same standard-participant lookup `participantGet` and `participantMute` use, so a recorder or an agent fails with the participant-not-found error before anything is removed; verify with a unit test in `meet-ce/backend/tests/unit/services/` (the existing room member or meeting service test file) that an egress or agent identity throws 404 and never calls `removeParticipant`.
- [x] 1.2 Add to `meet-ce/backend/tests/integration/api/meetings/kick-participant.test.ts` a case that starts a recording and kicks the recorder's identity, expecting 404 and the recording still `active`; report it as not run if the local deployment is unavailable.
- [x] 1.3 Check that the `participantKick` 404 description in `meet-ce/backend/openapi/meetings/` reads as "not a participant of the meeting" and covers recorders and agents; adjust the wording if it only says "not found".

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "- [`participantKick`][3.9-participant-kick] and the embedded command of the same name could disconnect the recorder of a recording in progress or the live captions assistant, which `participantGet` answers as not in the meeting. They now answer the same 404 for them." and add the link definition `[3.9-participant-kick]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/participantKick` at the end of the file.
- [x] 2.2 openvidu.io: none.
