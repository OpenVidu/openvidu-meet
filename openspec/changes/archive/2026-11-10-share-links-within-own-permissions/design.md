# Design

## Context

Paths are under `meet-ce/` unless stated.

- `getRoom` and `getRooms` (`backend/src/controllers/room.controller.ts`) read the caller's permissions in the room through `RoomAccessService.getAuthenticatedRoomMemberPermissions` and pass them to `MeetRoomHelper.applyPermissionFiltering` (`backend/src/helpers/room.helper.ts`). That helper deletes the three `access.anonymous.<role>.url` fields when the permission mapped to them in `SENSITIVE_ROOM_FIELDS_ENTRIES` (`typings/src/response/room-response.ts`), `roomShareAccessLinks`, is false.
- An API key, an `admin` user and the owner get `allPermissions()`, so they keep every URL.
- The permissions a link grants are those `RoomMemberService.resolveAnonymousAccessBySecret` gives its holder:
  - the moderator link: `roles.moderator.permissions`;
  - the speaker link: `roles.speaker.permissions`;
  - the recordings link: `MeetRoomMemberHelper.recordingReadOnlyPermissions()`.
- The frontend reads the URLs in three places:
  - `RoomUiUtils.hasAccessLinks` (`frontend/projects/shared-meet-components/src/lib/domains/rooms/utils/ui.ts`) decides whether the console offers sharing;
  - `RoomShareDialogComponent` offers the speaker and moderator options from their `enabled` flags alone;
  - `RoomAccessLinkService` (`domains/meeting/services/room-access-link.service.ts`) reads `roomShareAccessLinks` and then copies `access.anonymous.speaker.url` from `getRoom`, whether or not it was returned.
- `SENSITIVE_ROOM_FIELDS_ENTRIES` and `MeetRoomSensitiveFieldPath` are exported by `@openvidu-meet/typings`.

## Goals / Non-Goals

**Goals:**
- A caller never receives a link that grants a permission it lacks.
- The console and the meeting offer only the links they received.

**Non-Goals:**
- Changing what a link grants, or how a participant enters through it.
- A new permission per link. `roomShareAccessLinks` stays the one switch.

## Decisions

### D1. The rule is permission inclusion, not the role

A link is returned when the caller holds `roomShareAccessLinks` and every permission the link grants is also true in the caller's permissions.

The alternative was to compare roles: a moderator sees the moderator link, a speaker does not. Comparing permissions gives the same answer with the default roles. It also stays right when roles and members are customized, because every permission is independent:
- a member with base role `moderator` whose custom permissions drop `participantKick` cannot read a link that grants it;
- a moderator role that lacks something the speaker role was given does not see the speaker link.

The admin and owner bypass needs no special case, since `allPermissions()` includes every permission.

### D2. One pure function, and the room's roles in the projection

`MeetRoomHelper.grantsWithin(link: MeetRoomMemberPermissions, holder: MeetRoomMemberPermissions): boolean`, together with the permissions each link grants, decides each URL in `applyPermissionFiltering`.
- The URL fields leave the field-by-permission map, which keeps nothing else today. The backend stops importing `SENSITIVE_ROOM_FIELDS_ENTRIES`.
- `applyPermissionFiltering` needs the room's `roles`. When the filtering applies, `computeFieldsForRoomQuery` adds `roles` to the projection and the response drops it again when the caller did not ask for it, as it already does for `roomId` in `getRooms`.
- The rule reads one room document per room already loaded, so it needs no Redis, no extra query and no coordination. Every Meet replica answers alike.

### D3. The exported typings stay

`SENSITIVE_ROOM_FIELDS_ENTRIES` and `MeetRoomSensitiveFieldPath` stay exported and unchanged, because removing them before 3.12.0 would break an importer. Their TSDoc says that `roomShareAccessLinks` is necessary for the three URLs but not sufficient, and points to the OpenAPI description. Removing or deprecating them is left to the 3.12.0 clean-up.

### D4. The frontend trusts the response

- `RoomUiUtils.hasAccessLinks` already checks the URLs and stays as it is.
- `RoomShareDialogComponent` shows the speaker and moderator options only when their URL is present. The `enabled` flag still decides whether a present option can be chosen, so the disabled-link shortcut keeps working for managers, who always get every URL.
- `RoomAccessLinkService` treats a missing speaker URL like a disabled link: it shows no share link and leaves the "waiting for others" text.

## Risks / Trade-offs

- [An integration that read a link through a member token loses it] → Intended: that read was the escalation. The OpenAPI and the changelog say which links are returned. API keys, which most integrations use, are not affected.
- [A member whose permissions sit below their own role's set no longer sees their own role's link] → For example, a speaker member whose custom permissions drop `chatWrite` loses the speaker link. Sharing it would hand out more than they hold. The meeting shows the "waiting for others" text, as when the link is disabled.
- [`roles` read on every filtered room] → A small embedded document in a query that already runs, for at most one page of rooms.
