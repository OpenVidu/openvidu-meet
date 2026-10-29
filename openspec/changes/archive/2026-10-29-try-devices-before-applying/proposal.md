# Proposal

## Why

In a meeting, picking another camera or microphone in the Audio & video tab of the settings panel switches the device the others receive at once. The camera preview of that tab is the published video itself, so a participant cannot check how another camera looks, or whether another microphone picks them up, without showing it to everyone first. A wrong pick (a covered laptop camera, a muted headset) reaches the meeting before the participant can see it.

## What Changes

- In the meeting, picking a camera or a microphone in the Audio & video tab only changes that tab: the camera preview shows the picked camera and the level meter follows the picked microphone, while the others keep receiving the devices already published.
- An **Apply** button appears at the end of the tab while a pick differs from the published device. Pressing it switches the published camera and microphone to the picked ones in one step and remembers them for later entries, as a switch does today.
- A pick that is not applied is discarded when the panel closes, when the participant changes tab or leaves, or when they turn that device off; its capture is closed and the selector shows the published device again. Picking the published device back also discards it.
- The preview of a picked camera shows it without the background effect, with a hint that the effect applies to it once applied. The effect is applied to the camera when it is applied.
- A picked device that cannot be opened for the preview leaves the published device untouched, puts the selector back on it and shows the existing "could not be started" notice.
- The device setup screen keeps switching at once: nothing is published there yet, so its preview already is the device to be published.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-media`: a new requirement "Trying a device before applying it" for the meeting's Audio & video tab; "Device selection" distinguishes the device setup screen, where a pick switches at once, from the meeting, where it switches on Apply; "Audio and video settings" gains the Apply button; "Capture profile" covers the preview captures; "Background effects" names the preview of a camera not applied yet as the one preview without the effect.

## Impact

- Meeting UI: the Audio & video tab of the settings panel (camera preview, level meter, new Apply button and effect hint, two new translation keys in every locale). The device setup screen, the toolbar and the background effects panel do not change.
- Embedded API: no change. No event reports a device switch today, and `mediaVideoStatusChanged` and `mediaAudioStatusChanged` keep reporting on and off only.
- REST API, webhooks, console UI, deployment configuration: not affected. The change is client-side only and holds no server state.
- PRO: no seam changes. The settings selectors and panel are internal to the library; the trial is a service provided by the Audio & video tab, and a selector without one keeps switching at once.
- openvidu.io: no page documents device selection in the settings panel; no page changes.

## Decisions taken

- Camera and microphone both preview before applying, and one Apply button applies both (user decision).
- The preview of a picked camera does not run the background effect: a second segmentation pipeline costs about a core in software rendering and the processor is a single shared instance (user decision).
- A pick not applied is discarded when the panel closes or the tab changes, never kept pending with an open capture (user decision).
- The button reads "Apply" (user decision). There is no Cancel button: closing the panel or picking the published device back discards the pick.
