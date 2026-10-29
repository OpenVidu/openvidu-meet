# Design

## Context

All paths below are under `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

- `LocalMediaService` owns one camera and one microphone track for the whole entry: the device setup screen opens them and the meeting publishes the very same tracks. `switchCamera` / `switchMicrophone` call `restartTrack` on the published track through `switchDevice`, which goes back to the previous device when the new one cannot be opened and shows the "could not be started" notice.
- `VideoDevicesComponent` and `AudioDevicesComponent` (`components/settings/`) render both the device setup screen selectors (`compact` = true, in `meeting-media-setup`) and the Audio & video tab of the settings panel (`compact` = false, only in `settings-panel`). Picking calls `switchCamera` / `switchMicrophone` and then `DeviceService.setCameraSelected` / `setMicSelected`, which persist the choice.
- The camera preview of the tab binds `LocalMediaService.camera.track`, the published track, so it shows the published video including the background processor. The level meter reads `MicActivityService.level`, which samples a clone of the published microphone capture and also feeds the speaking-while-muted and system-muted warnings.
- The settings panel is rendered only while open (`panel.component.html` `@if (isSettingsPanelOpened())`), and the Audio & video tab's selectors exist only inside its `@case`, so both are destroyed when the panel closes or the tab changes.
- `VideoTrackProcessorService` holds a single background processor instance and moves it between tracks; `VirtualBackgroundService.isBackgroundApplied()` says whether an effect is selected. LiveKit keeps a track's processor across `restartTrack`.
- `DeviceService` refreshes `cameras` / `microphones` on `devicechange`.

## Goals / Non-Goals

**Goals:**
- One place that owns the tried devices of the meeting's Audio & video tab, their captures and their lifetime, so that every discard path in the spec is the same code path.
- The device setup screen keeps its immediate switch with no code path of its own added.

**Non-Goals:**
- Background effects on the tried camera, or a trial mode in the background effects panel (planned separately).
- Any change to `LocalMediaService`'s public operations or to how the toolbar toggles devices.
- Switching the published track without a capture gap (see Decisions, Apply).

## Decisions

- **A `DeviceTrialService` scoped to the Audio & video tab.** A new service under `services/device-trial/` holds the tried camera and microphone: the picked `CustomDevice`, the preview `LocalVideoTrack` / `LocalAudioTrack`, and a `pending` computed that drives the Apply button. Its `ngOnDestroy` stops every preview track. The tab's `@case` content (both selectors plus the Apply button) moves into a new `AudioVideoSettingsComponent` (`components/settings/audio-video-settings/`) that lists the service in its own `providers`. That component is destroyed when the tab changes, when the panel closes (the panel renders only while open) and when the participant leaves, so every one of those discards goes through the same `ngOnDestroy` without listening to panel events.
  - Alternative: provide it on `SettingsPanelComponent`. Rejected: changing tab destroys the selectors but not the panel, so a pick would survive a tab change.
  - Alternative: a root service that listens to `PanelService.panelOpened`. Rejected: it duplicates the lifetime Angular already gives a component-scoped provider and would leak captures if a close path is missed.
  - Alternative: keep the state inside each selector component. Rejected: one Apply button acts on both devices, so the state must be shared above them.
- **The selectors find out which mode they are in by injection.** `VideoDevicesComponent` and `AudioDevicesComponent` inject `DeviceTrialService` with `{ optional: true }`. With it (settings panel), a pick goes to `trial.tryCamera(device)` / `trial.tryMicrophone(device)`; without it (device setup screen), a pick switches at once as today. The selector shows `trial.camera.device() ?? cameraSelected()`, and the preview binds `trial.camera.track() ?? localMedia.camera.track()`. A host that provides the service gets the trial behaviour and one that does not gets the immediate one.
  - Alternative: key the behaviour on `compact`. Rejected: `compact` is a layout input, and coupling a behaviour to it would break the first time a compact selector appears in the meeting.
- **Trying a device opens a separate capture with the same profile.** `tryCamera` calls `LivekitSdkService.createLocalTracks({ video: cameraCaptureOptions(deviceId) })` through `acquireDevice`; `tryMicrophone` does the same with `microphoneCaptureOptions`. Picking the published device (compared with the published track's `getSettings().deviceId`) stops the preview instead. Every open carries a generation counter: a preview resolved after a newer pick, a discard or the service's destruction is stopped on arrival. A failed open discards the pick and calls the existing unavailable notice; `LocalMediaService.reportUnavailable` becomes public for that (it is the single owner of the notice's wording and duration).
- **The level meter of a tried microphone.** `MicActivityService` keeps monitoring the published microphone for the warnings. The sampling that turns an analyser into a 0 to 1 level moves into a small `MicLevelMeter` model (`models/`), with the RMS constants it needs; `MicActivityService` uses one for the published capture and `DeviceTrialService` creates one for the tried microphone, disposed with it. While a microphone is picked, the audio meter reads `trial.microphone.level()`, and `micActivity.level()` otherwise. The tried microphone is never attached to an audio element, so nothing is played back.
  - Alternative: point `MicActivityService` at the tried microphone. Rejected: the warnings would then describe a device the others do not hear.
- **Background effect hint.** While a camera is tried and `VirtualBackgroundService.isBackgroundApplied()` is true, the preview shows a caption (`PANEL.SETTINGS.EFFECT_APPLIES_ON_APPLY`). The tried camera gets no processor. On Apply the published track keeps its processor across `restartTrack`, so the effect follows the new camera with no extra step.
- **Apply reuses the switch path.** `apply()` disables the button, then for each tried device in turn: stops its preview track, calls `localMedia.switchCamera` / `switchMicrophone` (which already goes back and notifies on failure), then `deviceService.setCameraSelected` / `setMicSelected`, and clears the pick. The preview must be released first: some platforms refuse a second open of a device or answer `AbortError` while it is still held, which `acquireDevice` already retries. The others see a short gap of the camera while `restartTrack` reopens it, the same gap a switch has today. `apply()` returns the devices it put in place, and `AudioVideoSettingsComponent` emits `onVideoDeviceChanged` / `onAudioDeviceChanged` for them, so the panel's outputs now fire when a device is applied; on the device setup screen the selectors keep emitting them on the pick.
  - Alternative: hand the preview's `MediaStreamTrack` to the published track with `replaceTrack`. Rejected: LiveKit would keep the old device in the track's constraints, so the next `restartTrack` (turning the camera back on) would reopen the previous camera, and the processor would have to be moved by hand.
- **Discarding on device off and on unplug.** The service watches `localMedia.camera.enabled` / `microphone.enabled` and `DeviceService.cameras` / `microphones` in effects: a device turned off or a tried device no longer listed discards that device's pick only.
- **Several replicas.** The change is client-side only: no request, no server state and no Redis key are added, so it behaves the same with any number of Meet replicas.

## Risks / Trade-offs

- [Two cameras open at once while trying] -> Some USB controllers cannot stream two 720p cameras together; the tried camera then fails to open and the participant gets the existing notice, the published camera untouched. The trial capture lives only while the tab is open.
- [CPU while trying] -> A second 720p capture and its preview cost about what the preview cost in the settings panel audit (around 5% of a core); the meter's sampling costs the same as the published one (one 50 ms timer).
- [Gap on Apply] -> The others see the camera freeze or go black briefly while the device is reopened, as with today's switch. Accepted: avoiding it means `replaceTrack` and its constraint problem above.
- [Selector components gain a second mode] -> Kept to one branch per pick handler; the trial logic and its tests live in the service.
