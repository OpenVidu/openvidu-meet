## Why

The device setup screen lets a participant pick a microphone but never shows whether it picks up sound. A wrong or silent microphone is only discovered once in the meeting, when others say they cannot hear. The meeting already measures the local microphone level (it drives the speaking-while-muted warning), so the screen can show it.

## What Changes

- The device setup screen's camera and microphone controls become split controls, as in other meeting products: one frame, with the rounded corners of the current buttons, holding a raised toggle that turns the device on or off and a flat menu button that opens the device list. Background effects uses the same frame. Toggling and choosing are two separate buttons, with their own accessible names.
- The microphone toggle shows the live level of the selected microphone: its background fills from the bottom and rises and falls with the sound, like a wave. The menu button never fills.
- The level shows only while the microphone is on; a microphone that is off or muted by the system shows no level.
- Every screen built on the device setup controls shows it too.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-media`: the device setup screen's split device controls and the microphone's live level.

## Impact

- Meeting UI: the device setup screen's device controls, designed on the canvas https://claude.ai/artifact/SUGwB3GV8XhJsShM6sodvg. New accessible names (choose camera, choose microphone, picking up sound) in every locale.
- REST API, webhooks, embedded API, console UI, deployment: not affected.
- CE extension seams: none needed; the button stays a library component.
- openvidu.io: no page changes.
