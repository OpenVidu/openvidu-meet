# Proposal

## Why

`deleteRoom` and `bulkDeleteRooms` return the room they closed or scheduled for deletion, with its `roles`
when `extraFields=roles` is requested, but they skip the serializer every other room response goes
through. Those `roles` carry only the current permission keys, without the deprecated `can*` twins that
3.9.0 promised on every response until 3.12.0, so an integration still reading `canRecord` finds nothing.

## What Changes

- The rooms returned by `deleteRoom` (the `room` of the response) and by `bulkDeleteRooms` (each `room` in
  `deleted`) are serialized like every other room response, so their `roles` carry both key sets.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `permissions` spec already states the behavior: requirement "Both key sets on output" (every
permission object the server returns carries the current and the deprecated keys), whose scenario "Room
roles read back" now also holds for the room returned by `deleteRoom` and `bulkDeleteRooms`.

## Impact

- REST API: `deleteRoom`, `bulkDeleteRooms` (public). Additive: the deprecated keys appear next to the
  current ones, as the OpenAPI `meet-permissions.yaml` already documents.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: none (the console reads only the
  current keys).
- Code: `meet-ce/backend/src/controllers/room.controller.ts` (`deleteRoom`, `bulkDeleteRooms`).
- openvidu.io: none.
