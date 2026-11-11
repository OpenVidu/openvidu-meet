# Proposal

## Why

`roomShareAccessLinks` makes `getRoom` and `getRooms` return all three anonymous links of a room: moderator, speaker and recordings. A room member who holds it without the moderator permissions can read the moderator link and enter through it as a moderator. The permission meant to let them invite others gives them every permission of the moderator role, and, once the waiting room exists, a way past it.

## What Changes

- `getRoom` and `getRooms` include an anonymous link's URL only when the caller holds `roomShareAccessLinks` and every permission that link grants. With the default roles, a moderator still receives the moderator, speaker and recordings links, and a speaker allowed to share receives the speaker and recordings links but not the moderator one.
- An API key, an `admin` user and the room's owner hold every permission, so they still receive every link.
- The console's share dialog offers only the anonymous links the server returned. In the meeting, a participant whose share permission no longer reaches the speaker link sees the "waiting for others" notice, as when that link is disabled.
- This is a security fix. A caller that used to read a link granting more than its own permissions no longer receives it. Not marked **BREAKING**: it closes a privilege escalation, which the deprecation policy does not protect.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-access`: "Disclosure of the anonymous links" adds the per-link rule; "Sharing links from the console" and "Sharing the room from the meeting" offer only the links the server returned.

## Impact

- REST API: `getRoom` and `getRooms` omit `access.anonymous.<role>.url` in more cases. No field is added or renamed; the field was already optional. The OpenAPI descriptions of the three URLs and the TSDoc of `roomShareAccessLinks` say which links are returned.
- Console UI: the share dialog of the Rooms and room detail pages, for `room_member` users.
- Meeting UI: the share link, for a participant whose permissions do not cover the speaker link.
- Webhooks, embedded API, deployment configuration: not affected.
- `add-waiting-room`: the risk "`roomShareAccessLinks` reveals the moderator link" goes away, because the moderator link grants `waitingRoomBypass`, which a waiter lacks. Its design and proposal drop that risk and the related documentation tasks.
- `CHANGELOG.md`: one line under 3.10.0, `Fixed`, `Integration`.
- openvidu.io: `docs/meet/features/rooms/access.md` says that sharing offers only the links whose permissions the sharer holds.
