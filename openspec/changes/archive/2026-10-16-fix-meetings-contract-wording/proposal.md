# Proposal

## Why

Two pieces of contract wording around the meeting say something the code does not do:

- The TSDoc of `EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED` (`meet-ce/typings/src/embedded/events.ts`) says it is "Emitted from the prejoin screen onwards, before `meetingJoined`", copied from the camera and microphone events. A screen share cannot start on the prejoin (device setup) screen: `mediaToggleScreenShare` acts only once the meeting is joined (`meeting-media` "Embedded commands for the local devices"), so the event is only ever emitted after `meetingJoined`. The TSDoc is published as the embedded API reference.
- The comment above the live-introspection routes in `meet-ce/backend/src/routes/meeting.routes.ts` says `meetingRead` "defaults to the holder's `meetingJoin`". Permissions are independent (`permissions` "Meet SHALL never derive one permission from another"); `meetingRead` takes the value of `meetingJoin` only when completing a token or a stored role created before `meetingRead` existed.

## What Changes

- The `mediaScreenShareStatusChanged` TSDoc says it is emitted once the meeting is joined; the generated embedded API reference follows.
- The stale route comment is reduced to what the code cannot say on its own, or removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation only: the `meeting-media` and `permissions` specs already state the behavior.

## Impact

- Embedded API reference (`mediaScreenShareStatusChanged` description). No behavior or contract change.
- REST API, webhooks, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: the regenerated `shared/meet/webcomponent/events.md`.
