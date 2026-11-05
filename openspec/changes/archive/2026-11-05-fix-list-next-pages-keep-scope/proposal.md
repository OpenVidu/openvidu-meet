# Proposal

## Why

The list operations lost part of their query from the second page on. A `room_manager` or `room_member` user who
followed `nextPageToken` in `getRooms` or `getRecordings` received rooms and recordings outside their scope, the
ones they neither own, nor are a member of, nor may enter as a registered user: the first page was scoped and the
following ones were not. `getUsers` with both `userId` and `name` dropped both filters the same way. Separately,
when `fields` left out the field the list is sorted by, the page after the first was empty.

## What Changes

- The next page of `getRooms`, `getRecordings`, `getUsers` and `getRoomMembers` keeps every filter and the caller's
  scope of the first page.
- The next page continues the listing whatever `fields` holds; the response still carries only the requested fields.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rooms`: a new requirement, the pages after the first keep the filters and the access scope and honour `fields`.
- `recordings`: the pages after the first keep the access scope and honour `fields`.
- `users`: the pages after the first keep the `userId` and `name` filters.
- `room-members`: the pages after the first honour `fields`.

## Impact

- REST API: `getRooms`, `getRecordings`, `getUsers` and `getRoomMembers` return the right pages; the OpenAPI does not
  change.
- Console UI: the Rooms and Recordings pages of `room_manager` and `room_member` users no longer list foreign rooms
  and recordings when loading more.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: `findMany` in `meet-ce/backend/src/repositories/base.repository.ts`.
- openvidu.io: none.

## Source

MongoDB index study of 2026-11-05: both defects were reproduced on a seeded database while measuring the list
queries (a `room_member` paging to the end of `getRooms` received 67,223 rooms outside their scope out of 99,761).
