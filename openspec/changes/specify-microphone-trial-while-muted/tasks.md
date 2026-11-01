# Tasks

## 1. Apply the decision

- [ ] 1.1 Option A: update the requirements "Trying a device before applying it" and "Discarding a device that was not applied" of `meeting-media` (on `origin/main` only, #143) to state that the microphone selector is disabled while muted and that muting discards the pick; no code change. Option B: remove the `!isMicrophoneEnabled()` disable in `.../components/settings/audio-devices/audio-devices.component.html` (lines 76-78) and `.ts` (line 42), drop the discard on mute in `.../services/device-trial/device-trial.service.ts` (lines 111-112), keep the capture used by the muted-speaking warning alive after Apply on a muted microphone (`local-media.service.ts`, lines 180-183), and update the same requirements. Verify option B with cases in `device-trial.service.spec.ts` and `meet-ce/frontend/e2e/media-devices.test.ts` (Playwright, needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (the device trial is new in 3.10.0; the entry about picked devices already describes the behavior without the muted case).
- [ ] 2.2 openvidu.io: none.
