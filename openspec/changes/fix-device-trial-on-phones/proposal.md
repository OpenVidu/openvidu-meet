# Proposal

## Why

Trying a camera or a microphone in the meeting's Audio & video tab opens a second capture of the same kind while the published one stays live, and phones do not allow that. On most Android phones the other camera cannot open, so the participant gets "could not be started", no Apply, and no other way to switch camera during the meeting, which 3.9 allowed; on iPhones and iPads the browser mutes the published camera or microphone for everyone while the pick is pending. Safari also ends a microphone opened next to another one.

## What Changes

- Trying a device before applying it is offered only where the browser can keep a second capture of that kind next to the published one. On Android, iOS and iPadOS phones and tablets, for the camera and the microphone, and in Safari for the microphone, a pick in the meeting's Audio & video tab switches the published device at once, as the device setup screen does and as the meeting did in 3.9, with no Apply button.
- Where the pick switches at once, the tab says so beside the camera or microphone selector (when there is another device to pick): the others see or hear the new device as soon as it is picked. The note is new text in the ten bundled languages.
- Computers keep the trial for the camera in every browser and for the microphone outside Safari.
- Where the trial applies is decided per device kind from the platform before anything is opened: on iOS the second capture opens without error and only then mutes the published one, so a failure cannot be the signal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-media`: new requirement "Where devices can be tried"; "Trying a device before applying it" applies only there; "Device selection" switches on Apply only where the meeting lets the participant try the device first.

## Impact

- Meeting UI: the Audio & video tab of the settings panel on phones and tablets (both devices) and in Safari (microphone): a pick switches at once, no Apply button appears and a note beside the selector says the others receive it at once. Computers are unchanged otherwise. The device setup screen does not change.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected; no public contract changes. The change is client-side only and holds no server state.
- Code: `PlatformService` and the camera and microphone selectors of the settings (`VideoDevicesComponent`, `AudioDevicesComponent`) under `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.
- PRO: no seam changes; a selector without a trial for its kind keeps switching at once, as on the device setup screen.
- openvidu.io: none (no page documents device selection in the settings panel).

## Decisions to confirm

- Which platforms leave the trial out. Proposed: Android, iOS and iPadOS phones and tablets for both devices, and Safari for the microphone, detected from the user agent. Alternative: phones only (`isPhysicalMobileDevice()`, as the audit suggested), keeping the trial on tablets, although iPads follow the same WebKit capture rule as iPhones.
- How a pick behaves where the trial is left out. Proposed: it switches at once, as on the device setup screen and in 3.9. Alternative: keep a trial there that stops the published capture while the device is tried, so the others lose the camera or the microphone until Apply or discard.
- Safari on a computer for the camera. Proposed: keep the camera trial, since only the microphone is known to fail there (livekit-client stops the old microphone before reopening one in Safari for that reason). Alternative: leave Safari out for both devices until a Mac shows the camera trial works.

## Source

3.10.0 pre-release audit, finding UI-1 (high, static + emulated), introduced by #143.
