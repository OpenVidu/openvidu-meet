# Proposal

## Why

Two permissions do nothing without another one, yet nothing tells a room manager so: `chatWrite` without
`chatRead` hides the chat panel, and with it the message input, and `mediaChangeVirtualBackground` without
`mediaPublishVideo` leaves a background control that stays disabled because the camera can never be turned
on. Worse, the server still grants a participant holding `chatWrite` but not `chatRead` the right to publish
chat messages, so a modified client can write into a chat its holder is not allowed to read. `broadcastEdit`
already follows this pattern with `broadcastControl` in the room wizard and on the server, but the console
member form ignores it.

## What Changes

- The server lets a participant publish chat messages only when they hold both `chatRead` and `chatWrite`
  (and the room's chat is enabled), at join and whenever their permissions change during the meeting.
- The meeting no longer offers background effects to a participant without `mediaPublishVideo`, instead of
  showing a control that can never be used.
- The Room Access step of the room wizard disables a role's `chatWrite` switch while that role lacks
  `chatRead`, and its `mediaChangeVirtualBackground` switch while it lacks `mediaPublishVideo`, keeping their
  values, as it already does for `broadcastEdit` and `broadcastControl`. The background switch moves next to
  the camera one.
- The console member form applies the same three dependencies (`chatWrite` on `chatRead`,
  `mediaChangeVirtualBackground` on `mediaPublishVideo`, `broadcastEdit` on `broadcastControl`) to its
  permission toggles.
- Stored values are untouched: every permission stays independent, every combination stays valid, and a
  dependent permission simply has no effect while the other is denied.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-chat`: server enforcement of `chatWrite` also requires `chatRead`; the wizard's chat switches
  follow the new dependency.
- `meeting-media`: background effects are offered only with `mediaPublishVideo`.
- `permissions`: the chat and media permission lists say which permission each dependent one needs.
- `rooms`: the wizard's dependent settings cover the virtual background switch's dependency on the camera one.
- `room-members`: the member form's permission toggles follow the dependencies.

## Impact

- REST API and webhooks: no contract change. The OpenAPI descriptions of `chatWrite` and
  `mediaChangeVirtualBackground` in `MeetPermissions` gain the dependency, as `broadcastEdit` already states.
- Embedded API: no change. The typings TSDoc of `chatWrite` and `mediaChangeVirtualBackground` gains the
  dependency.
- Meeting UI: no background effects without `mediaPublishVideo`; the media server refuses chat messages from a
  participant without `chatRead`, which the interface never let them send anyway.
- Console UI: room wizard Room Access step and member form toggles.
- Deployment configuration: none.
- A participant in a meeting during the upgrade keeps the grant of their current token until it is renewed; no
  migration, since no stored value changes.
- openvidu.io: `docs/meet/features/rooms/access.md` (the note that says every permission is independent).
