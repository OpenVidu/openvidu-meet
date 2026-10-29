# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/` unless they start with `meet-ce/`.

## 1. Microphone level meter as a reusable model

- [x] 1.1 Move the analyser sampling that produces the 0 to 1 level (RMS, `FULL_LEVEL_RMS`, `LEVEL_CHANGE_THRESHOLD`, `SAMPLE_INTERVAL_MS`, clone and cleanup) out of `services/mic-activity/mic-activity.service.ts` into a `MicLevelMeter` model in `models/`, with a `level` signal and a `dispose()`; `MicActivityService` keeps its voice-activity and system-muted logic on top of it and its public signals unchanged. Verify with a co-located `MicLevelMeter` spec (level follows a stubbed analyser, `dispose()` stops the clone and the timer) and `./meet.sh test-unit-frontend` green.

## 2. Device trial service

- [x] 2.1 Make `LocalMediaService.reportUnavailable` public so the trial reuses the "could not be started" notice; verify `local-media.service.spec.ts` still passes.
- [x] 2.2 Create `services/device-trial/device-trial.service.ts` (`@Service()` without `providedIn` root, component-scoped) holding per device the picked `CustomDevice`, the preview track and, for the microphone, a `MicLevelMeter`; `tryCamera` / `tryMicrophone` open a capture with `cameraCaptureOptions` / `microphoneCaptureOptions` through `acquireDevice`, picking the published device stops the preview, a stale open (newer pick, discard or destroy) is stopped on arrival, and a failed open discards the pick and calls `reportUnavailable`. Verify in a co-located `device-trial.service.spec.ts`: trying opens one capture with the profile, re-picking the published device stops it, a slow first open resolved after a second pick is stopped, a failed open leaves no pick and notifies.
- [x] 2.3 Discard a device's pick when `LocalMediaService` reports that device off and when `DeviceService` no longer lists it, and stop every preview in `ngOnDestroy`; verify in `device-trial.service.spec.ts` that turning the camera off keeps the microphone pick, that an unplugged tried camera is discarded and that destroying the service stops all preview tracks.
- [x] 2.4 Implement `apply()`: for each pick, stop its preview, call `switchCamera` / `switchMicrophone`, then `setCameraSelected` / `setMicSelected`, and clear it; expose an `applying` signal and a `pending` computed. Verify in `device-trial.service.spec.ts` that applying both devices switches and persists both, that a failed switch does not persist the device and still clears the pick, and that `pending` is false afterwards.

## 3. Audio & video tab

- [x] 3.1 Create `components/settings/audio-video-settings/` rendering the camera and microphone selectors and the Apply button (`#settings-apply-devices`, shown while `pending`, disabled while `applying`), with `DeviceTrialService` in its `providers`; replace the `AUDIO_VIDEO` `@case` content of `settings-panel.component.html` with it, keeping the `onVideo*` / `onAudio*` outputs. Verify the settings panel still renders both selectors in the meeting (`./meet.sh dev`, Audio & video tab).
- [x] 3.2 In `VideoDevicesComponent` and `AudioDevicesComponent`, inject `DeviceTrialService` optionally: with it, a pick calls `tryCamera` / `tryMicrophone`, the field shows the tried device, the camera preview binds the tried track and the meter reads the tried level; without it, the device setup screen keeps switching at once. The device-changed outputs are emitted on apply. Extend `video-devices.component.spec.ts` and `audio-devices.component.spec.ts`: with a trial service a pick does not call `switchCamera` / `switchMicrophone`, without one it does.
- [x] 3.3 Show the caption `PANEL.SETTINGS.EFFECT_APPLIES_ON_APPLY` over the camera preview while a camera is tried and `VirtualBackgroundService.isBackgroundApplied()` is true, and add `PANEL.SETTINGS.APPLY` and `PANEL.SETTINGS.EFFECT_APPLIES_ON_APPLY` to all ten locale files of `domains/meeting/lang/`; verify every locale file has both keys, `./meet.sh lint-frontend` passes and the caption shows with blur applied.
- [x] 3.4 Update `meet-ce/frontend/e2e/media-devices.test.ts`: the "videoconference page" device test presses `#settings-apply-devices` before expecting the published track to change; add tests in the same file that (a) a picked camera does not change the published track until Apply, (b) closing the settings panel discards the pick, leaving the published track and the selector on the original camera and no extra live video capture, (c) a picked microphone and camera are both published after one Apply. Run with `./meet.sh test-e2e-frontend` against the local deployment, or report it as not run when unavailable.

## 4. Release surfaces

- [x] 4.1 `CHANGELOG.md`: the device switch existed in 3.9.0, so the change is observable; extend the existing 3.10.0 `Improved` > `UI` line of the settings panel (one entry per feature) so its Audio & video part says that a picked camera or microphone is previewed in the tab and Apply switches the one the others receive. Confirm the wording with the user before committing.
- [x] 4.2 openvidu.io: none (no page documents device selection in the settings panel).

## Workflow follow-up

- Run `/opsx:archive` inside the pull request before merging, then `npx openspec validate --all --strict`.
