# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/` unless they start with `meet-ce/`.

## 1. Capture the screen audio as played

- [x] 1.1 In `services/screen-share/screen-share.service.ts`, replace `audio: true` in `captureOptions()` with `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true }`, which both starting and replacing a share use. Verify with `./meet.sh lint-frontend`, the library build (`lib:build`) and the library unit suite.
- [x] 1.2 Add a test to `meet-ce/frontend/e2e/screensharing.test.ts` that shares the screen and reads the settings of the published audio tracks: the screen-share audio reports echo cancellation, noise suppression and automatic gain control off, and the microphone keeps them on. Run `screensharing.test.ts` with Playwright (`spa` project) against the local deployment.
- [x] 1.3 Measure with the WebRTC audit harness (`../openvidu-meet-webrtc-audit`) on a production build of this branch a 1:1 meeting sharing a silent tab: the screen-share audio sends about 1 kbps and each viewer receives about 1 kbps, against about 60 kbps on `main`.
- [ ] 1.4 On a Windows machine with Chrome, share the entire screen with system audio while another participant speaks, and confirm that participant does not hear their own voice back. Done by hand by a reviewer; the pull request stays a draft until it passes.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: add to 3.10.0 `Improved` > `UI` that the audio of a shared screen is captured without voice processing.
- [x] 2.2 openvidu.io: none (no page documents screen-share audio).

## Workflow follow-up

- Run `/opsx:archive` inside the pull request before merging, once 1.4 passes, then `npx openspec validate --all --strict`.
