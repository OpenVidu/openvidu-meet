# Proposal

## Why

With another camera and another microphone picked in the meeting's Audio & video tab, Apply switches the camera first and only looks at the microphone pick once the camera has switched. A participant who presses Apply and closes the settings panel or changes tab before that, which takes a second or more with a real USB camera, loses the microphone pick without notice: the others get the new camera but keep hearing the old microphone, and the selector shows the old one again.

## What Changes

- Apply takes both picks and closes both tried captures the moment it is pressed, then switches the published camera and microphone and remembers them, whatever happens to the panel meanwhile. The switches already run in the root-provided local media service, which outlives the panel.
- The per-device read of the pick after the camera switch disappears with it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-media`: "Applying the devices tried" states that the switch of both devices completes even when the panel closes or the tab changes right after Apply, with a scenario for it.

## Impact

- Meeting UI: the Apply button of the settings panel's Audio & video tab. Nothing else changes.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected; no public contract changes. Client-side only, so the number of Meet replicas does not matter.
- Code: `DeviceTrialService.apply()` in `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/services/device-trial/`.
- openvidu.io: none.

## Decisions to confirm

- None: the fix makes the requirement's "in one step" hold for the gesture "Apply, then close".

## Source

3.10.0 pre-release audit, finding UI-2 (medium, verified-live), introduced by #143.
