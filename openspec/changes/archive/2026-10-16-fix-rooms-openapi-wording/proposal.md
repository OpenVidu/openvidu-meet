# Proposal

## Why

Several descriptions in the rooms and room members OpenAPI contradict what the server does, and the
published REST API reference repeats them:

- `access.user.enabled` is documented with `default: true`; a room is created with user access disabled.
- `autoDeletionDate` says the room is "closed to new participants" after the date and removed after the last
  participant leaves. The room keeps working, new participants included, until the hourly sweep processes it
  with its `autoDeletionPolicy` (USER DECISION 2026-10-14, specified in `rooms`).
- `roles` says `extraFields` is header-only on POST and PUT while `config` says the query parameter works on
  every request; the server accepts both on every room operation, but `createRoom` and `updateRoomStatus`
  declare only the headers.
- `MeetPermissions` says a room member's permissions are a partial object where an omitted key keeps its
  value; `updateRoomMember` replaces `customPermissions` as a whole, so an omitted override falls back to the
  base role. `mediaChangeVirtualBackground` reads as enforced, while the background is applied in the
  participant's browser and the server cannot check it.
- `addRoomMember` documents `404` only for a missing room; it also answers `404` for a `userId` that names no
  user.
- `getRoomMember` lists only the `admin` and `room_manager` roles; a room manager may read only their own
  membership unless they own the room, and a room member token may read its own member.

## What Changes

- Reword those descriptions, set `user.enabled`'s `default` to `false`, declare the `fields` and
  `extraFields` query parameters on `createRoom` and `updateRoomStatus`, and document the second `404` of
  `addRoomMember`.
- Replace the em dashes left in `meet-ce/backend/openapi/rooms/` and `meet-ce/backend/openapi/room-members/`.
- `chat.enabled` is left to `fix-enforce-chat-enabled-in-media-grant`, whose wording follows its server
  enforcement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: documentation only. The behavior is already in `rooms` ("Auto-deletion date and policy", "Automatic
deletion of expired rooms", "Field projection of room responses"), `room-access` ("Default access
settings"), `room-members` ("User members", "Updating a member", "Reading one member") and `meeting-media`
("Where background effects are offered").

## Impact

- REST API reference (public OpenAPI under `meet-ce/backend/openapi/rooms/` and `room-members/`): wording,
  one `default` value, two declared query parameters and one documented `404` case. No behavior change.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: none.
- openvidu.io: the REST API reference regenerated on `next`; no page edited.
