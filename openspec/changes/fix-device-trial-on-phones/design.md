# Design

## Context

Paths are under `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.

- `DeviceTrialService` (`services/device-trial/`) opens a tried device with its own `createLocalTracks` call (`TriedDevice.try`, `openOne`) while the published track stays live, and `apply()` closes it before `switchCamera` / `switchMicrophone` restart the published track.
- `VideoDevicesComponent` and `AudioDevicesComponent` (`components/settings/`) inject the service optionally. With it a pick is tried; without it (the device setup screen) a pick switches at once through `LocalMediaService`, whose `restartTrack` stops the old capture before opening the new one. That is the path the meeting used in 3.9.
- Platforms: most Android camera stacks refuse a second open of a camera (`NotReadableError`, which `acquireDevice` does not retry). WebKit, the engine of every iOS and iPadOS browser, keeps one active capture source per kind and mutes the previous one when another starts; livekit-client then pauses the upstream after 5 s of track mute. livekit-client itself stops the old microphone before reopening one in Safari, because otherwise the new track ends with "A MediaStreamTrack ended due to a capture failure".

## Decisions

- **Decided per device kind, from the platform, before opening.** New `PlatformService.canCaptureSecondCamera()` and `canCaptureSecondMicrophone()` answer false on Android, iOS and iPadOS and, for the microphone, in Safari. Two methods rather than one taking a `Track.Kind`: the service is shared with the recordings pages, which must not pull livekit-client in. Detecting the limit from a failed open would cover Android only: on iOS the second open succeeds and mutes the published device for everyone.
- **The selectors decide, not the provider.** Each selector takes the trial only when its kind can be captured twice, so a pick falls through to the existing immediate switch. A provider factory that gives the whole tab no trial (the audit's suggestion) is one line shorter but cannot keep the camera trial in Safari while dropping the microphone one. `AudioVideoSettingsComponent` keeps providing the service; with no pick it opens nothing and its Apply button never shows.
- **One note per selector, no other new UI.** Where the trial is left out the tab behaves as the device setup screen does, plus a hint line under the camera or microphone selector (shown only when there is a second device to pick) saying the others receive the pick at once. Each selector shows its own, since Safari on a computer loses the trial for the microphone only. It reuses the settings panel hint style and two keys, `PANEL.SETTINGS.CAMERA_SWITCHES_AT_ONCE` and `MICROPHONE_SWITCHES_AT_ONCE`, in the ten locales.

## Alternatives

- Feature detection at pick time, falling back to an immediate switch on `NotReadableError`: covers Android only.
- A trial that pauses the published capture on phones: the others lose the camera or the microphone for as long as the participant looks at the preview.
- Phones only, through `isPhysicalMobileDevice()`: leaves iPads and Android tablets with the same failure.

## Several replicas

Client-side only: no request, no server state and no Redis key are involved, so it behaves the same with any number of Meet replicas.

## Risks / Trade-offs

- [The user agent misleads the detection, for example an Android tablet requesting the desktop site] → that device keeps the trial and, on Android, fails as today with the "could not be started" notice and the published device untouched. An iPad requesting the desktop site is still detected through `isIPad()` (a Macintosh user agent with touch).
- [Safari on a Mac also mutes the published camera when a second one opens] → the real-device check (task 1.4) covers it; if it does, the Safari rule extends to the camera.
