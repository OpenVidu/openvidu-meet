# Proposal

## Why

When a host calls `recordingStart()` and the participant leaves (or the meeting ends) before the media server
accepts the recording, the late answer re-seeds the recording state with the previous meeting's recording. The next
meeting of the same embedded element then shows a recording that is "starting", and `recordingStop()` there fails
with `403`.

## What Changes

- The recording id returned by a `recordingStart()` is stored only while the participant is still in the meeting
  the command started in.
- No spec change: the fix makes the scenario "Next meeting with the same embedded element" of the requirement
  "Recording status shown to every participant" of `recordings` hold for a start answered after leaving.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `recordings` "Recording status shown to every participant".

## Impact

- Embedded API and meeting UI: the recording state of the next meeting is clean. No contract change.
- Code: the recording start command in the embedded command service of `shared-meet-components`.
- REST API, webhooks, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, finding RC-2 (low, static-high), introduced by #101.
