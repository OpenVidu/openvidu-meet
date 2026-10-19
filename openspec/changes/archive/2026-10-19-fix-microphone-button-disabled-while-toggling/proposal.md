# Proposal

## Why

The toolbar disables the camera button while a camera change is in progress, so a second press cannot start the opposite change before the first one ends. The microphone button is meant to work the same way, but its handler sets the "changing" flag to `false` where it should set it to `true`, so the button never disables and quick presses can overlap: the second change starts from a state the first one has not finished applying.

## What Changes

- The microphone button of the meeting toolbar is disabled while a microphone change it started is in progress, as the camera button already is.
- The `meeting-media` spec states the behavior for both buttons.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-media`: new requirement "Device buttons wait for the change in progress".

## Impact

- Meeting UI: the toolbar microphone button. No contract change.
- REST API, webhooks, embedded API (the `mediaToggleAudio` command has its own path), console UI, deployment configuration: not affected.
- openvidu.io: no page changes.
