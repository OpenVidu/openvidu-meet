# Design

## Context

Paths are under `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

- `DeviceTrialService` (`services/device-trial/`) opens a tried device with its own `createLocalTracks` call (`TriedDevice.try`, `openOne`) while the published track stays live, and `apply()` closes it before `switchCamera` / `switchMicrophone` restart the published track.
- `VideoDevicesComponent` and `AudioDevicesComponent` (`components/settings/`) inject the service optionally. With it a pick is tried; without it (the device setup screen) a pick switches at once through `LocalMediaService`, whose `restartTrack` stops the old capture before opening the new one. That is the path the meeting used in 3.9.
- Platforms: most Android camera stacks refuse a second open of a camera (`NotReadableError`, which `acquireDevice` does not retry). WebKit, the engine of every iOS and iPadOS browser, keeps one active capture source per kind and ends the previous one when another starts. Checked on an iPhone with a probe page, in Safari and in Chrome, for the camera and the microphone: the first track fires `ended` as the second opens. livekit-client itself stops the old microphone before reopening one in Safari, because otherwise the new track ends with "A MediaStreamTrack ended due to a capture failure".

## Decisions

- **Decided from the platform, before opening.** A new `PlatformService.canCaptureSecondDevice()` answers false on Android, iOS and iPadOS and in Safari. Detecting the limit from a failed open would cover Android only: on iOS the second open succeeds and ends the published device for everyone.
- **The selectors decide, not the provider.** Each selector takes the trial only when the platform can capture a second device, so a pick falls through to the existing immediate switch. `AudioVideoSettingsComponent` keeps providing the service; with no pick it opens nothing and its Apply button never shows.
- **One note per selector, no other new UI.** Where the trial is left out the tab behaves as the device setup screen does, plus a hint line under the camera or microphone selector (shown only when there is a second device to pick) saying the others receive the pick at once. It reuses the settings panel hint style and two keys, `PANEL.SETTINGS.CAMERA_SWITCHES_AT_ONCE` and `MICROPHONE_SWITCHES_AT_ONCE`, in the ten locales.

## Alternatives

- Feature detection at pick time, falling back to an immediate switch on `NotReadableError`: covers Android only.
- A trial that pauses the published capture on phones: the others lose the camera or the microphone for as long as the participant looks at the preview.
- Phones only, through `isPhysicalMobileDevice()`: leaves iPads and Android tablets with the same failure.

## Several replicas

Client-side only: no request, no server state and no Redis key are involved, so it behaves the same with any number of Meet replicas.

## Risks / Trade-offs

- [The user agent misleads the detection, for example an Android tablet requesting the desktop site] → that device keeps the trial and, on Android, fails as today with the "could not be started" notice and the published device untouched. An iPad requesting the desktop site is still detected through `isIPad()` (a Macintosh user agent with touch).
- [Safari on a Mac keeps the published camera when a second one opens, so the trial is lost there for nothing] → accepted: no Mac was available to check it, and ending a published camera costs more than a missing preview. A later check can narrow the rule.
