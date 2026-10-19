# Tasks

## 1. Microphone button disabled during its change

- [x] 1.1 Set the microphone "changing" flag to `true` at the start of the toolbar's microphone toggle (it is reset in `finally`); verify with a Karma spec of the toolbar component, or of the media buttons component, that the microphone button is disabled while `setMicrophoneEnabled` is pending and enabled after it resolves or rejects.
- [x] 1.2 Add to `meet-ce/frontend/e2e/toolbar.test.ts` a test that presses the microphone button twice in quick succession and checks that the microphone ends in the state of a single press; report it as not run if the local deployment is unavailable.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "- The microphone button of the meeting toolbar stayed enabled while the microphone was being turned on or off, so a quick second press started the opposite change before the first one ended. It is now disabled until the change ends, like the camera button."
- [x] 2.2 openvidu.io: none.
