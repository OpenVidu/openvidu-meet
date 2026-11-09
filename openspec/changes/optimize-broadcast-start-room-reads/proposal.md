# Proposal

## Why

Every request to go live reads the same room document from the database three times, four with a member
token, which is wasted work on the hottest broadcast path. The result for the caller is identical.

## What Changes

- The broadcast-enabled middleware is deleted. The start reads the room name, its config and its
  destination URLs in one repository query and refuses with the `Broadcast Error` `403` itself when the
  room has live broadcast disabled.
- No behavior changes: the permission middlewares still run first, so the `403` order is the same, and
  `add-live-broadcast` ("Live broadcast is enabled per room") already specifies the refusal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Requirement "Live broadcast is enabled per room" and its scenario "Start
refused in a room with live broadcast disabled" keep holding.

## Impact

- Code: `middlewares/broadcast.middleware.ts` (`withBroadcastEnabled`), `routes/broadcast.routes.ts` and
  `services/broadcast.service.ts` (`startBroadcasts`), plus one repository method for the combined
  read, in `meet-ce/backend/src`.
- REST API, webhooks, embedded API, UIs, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Where the combined read lives. Proposed: a repository method returning `roomName`, `config` and
  `broadcastDestinationUrls`. Alternative: reuse the request-scoped room config of #144
  (`getRequestRoomConfig`) for the enabled check and keep one read in the service.

## Source

3.10.0 pre-release audit, finding BB-6 (low, static-high), introduced by #120.
