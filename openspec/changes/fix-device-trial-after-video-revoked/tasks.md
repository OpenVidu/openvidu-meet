# Tasks

## 1. Discard a pick whose section is hidden

- [ ] 1.1 In `AudioVideoSettingsComponent` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/components/settings/audio-video-settings/`) add an effect on `showCamera()` and `showMicrophone()` that discards that kind's pick when its section is hidden. Verify with a new case in `.../services/device-trial/device-trial.service.spec.ts` (or the component spec): trying a camera, then revoking `mediaPublishVideo`, closes the capture and removes Apply while a microphone pick stays.
- [ ] 1.2 Update requirement "Discarding a device that was not applied" of `meeting-media`, which exists on `origin/main` only (#143): add "when the permission to publish that device is revoked" to its list and a scenario for it, in the same pull request once the branch contains #143.

## 2. Release surfaces

- [ ] 2.1 CHANGELOG: none (the device trial is new in 3.10.0, so a fix to it has no line of its own).
- [ ] 2.2 openvidu.io: none.
