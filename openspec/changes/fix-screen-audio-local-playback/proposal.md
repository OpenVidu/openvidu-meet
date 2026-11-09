# Proposal

## Why

The screen-share options set `suppressLocalAudioPlayback` with the comment "Prevent echo by not playing local audio",
but the LiveKit client never passes that option to the browser, so it does nothing: the presenter keeps hearing the
shared tab, and the comment describes a protection that does not exist next to the one that does.

## What Changes

- Delete the inert option and its comment from the screen-share capture options; the echo protection stays the
  `restrictOwnAudio` constraint of the system audio.
- No spec change: observable behavior is unchanged, and `meeting-media` "Shared screen audio" already states the
  echo protection that exists.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Code cleanup with no observable change.

## Impact

- Meeting UI: no change (the presenter hears the shared tab today and still does).
- Code: the screen-share capture options in the screen share service of `shared-meet-components`.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Whether the presenter should hear the shared tab. Proposed: yes, as today (delete the option). Alternative: stop local playback by moving `suppressLocalAudioPlayback` into the `audio` constraint object, which changes what the presenter hears and needs a spec scenario.

## Source

3.10.0 pre-release audit, finding UI-6 (low, static-high), introduced by #146.
