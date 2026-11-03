# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/` unless they start with `meet-ce/`.

## 1. Leave the trial out where two captures of a kind cannot coexist

- [ ] 1.1 In `services/platform/platform.service.ts`, add `canCaptureTwice(kind: Track.Kind): boolean`: false on Android and on iOS/iPadOS (`isAndroid()`, `isIos()`) for both kinds, and in Safari for `Track.Kind.Audio`, through a public Safari check built from the existing private `isIOSWithSafari` user-agent test (Chromium-based and Firefox user agents excluded). It is covered by the selector tests of 1.2, which stub `PlatformService`, and by the e2e of 1.3.
- [ ] 1.2 In `components/settings/video-devices/video-devices.component.ts` and `components/settings/audio-devices/audio-devices.component.ts`, take `DeviceTrialService` only when `PlatformService.canCaptureTwice` holds for the selector's kind (`null` otherwise), so `onCameraSelected` / `onMicrophoneSelected` fall through to the existing immediate switch and nothing becomes pending for the Apply button of `AudioVideoSettingsComponent`. Extend `video-devices.component.spec.ts` and `audio-devices.component.spec.ts`: with a trial service provided and a platform that cannot capture that kind twice, a pick calls `switchCamera` / `switchMicrophone` and never `tryCamera` / `tryMicrophone`; run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.
- [ ] 1.3 Add to `meet-ce/frontend/e2e/media-devices.test.ts`, with the two-camera fixture and an Android phone user agent, a test where picking the other camera in the meeting's Audio & video tab changes the published camera track at once and `#settings-apply-devices` never appears. Run `./meet.sh test-e2e-frontend` against the local deployment, or report it as not run when unavailable.
- [ ] 1.4 Before the release, check on real devices and record the models and browser versions in the pull request: on an Android phone (Chrome) and an iPhone (Safari), switching camera and microphone from the settings panel reaches another participant with no "could not be started" notice and no muted gap; in Safari on a Mac, a microphone switches at once and a camera is still tried without muting the published one (if it mutes it, extend the Safari rule of 1.1 and of the delta to the camera).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: the device trial (#143) is new in 3.10.0, so no line of its own. Amend the 3.10.0 `Improved` > `UI` settings panel entry so the trial reads as a computer feature, for example "a camera preview and a microphone level meter that, on a computer, show a picked camera or microphone before Apply switches the one the others receive". Confirm the wording with the user before committing.
- [ ] 2.2 openvidu.io: none (no page documents device selection in the settings panel).
