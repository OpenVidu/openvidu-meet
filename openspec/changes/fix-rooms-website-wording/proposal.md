# Proposal

## Why

Two openvidu.io pages on `next` describe rooms wrongly:

- `docs/meet/features/rooms/overview.md:8` calls a room "customizable with a name, appearance, and security
  settings", and line 20 says the management page lets you "configure their features and appearance". The
  appearance is global to the deployment, not per room (`appearance` spec; `room-config` Purpose), as the
  management page itself explains in "Room Appearance". Line 20 also carries an em dash.
- `docs/meet/features/meetings/configuration.md:24` says the participant limit "is read when the meeting
  starts, so changing it does not affect a meeting already in progress". The room config cannot change at
  all while a meeting is active: `updateRoomConfig` answers `409` and the wizard refuses to edit the room
  (`room-config` "Config fixed during a meeting", `rooms` "Editing a room in the wizard").

## What Changes

- `overview.md`: a room is customizable with a name, its features and its access settings; the appearance of
  every room is set once for the whole deployment, linking to the "Room Appearance" section of
  `management.md`. Line 20 drops "and appearance" and the em dash (the other bullet's em dash on line 21 too).
- `configuration.md`: the meeting settings, the participant limit included, cannot be changed while a meeting
  is in progress; a change applies from the next meeting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: documentation only, matching the `appearance`, `room-config` and `rooms` specs.

## Impact

- openvidu.io `next`: `docs/meet/features/rooms/overview.md`, `docs/meet/features/meetings/configuration.md`.
- REST API, webhooks, embedded API, meeting UI, console UI, deployment configuration: none.
