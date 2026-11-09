# Proposal

## Why

When a participant's connection drops and comes back, the meeting brings its live broadcasts up to date
by reading them from the server, which only a participant holding `meetingRead` may do. A participant
without it skips that catch-up, so a broadcast that ended during the outage keeps its LIVE mark (and its
Stop control, with `broadcastControl`) for the rest of the meeting, and an embedded host never receives
its `broadcastEnded`.

## What Changes

Depending on the decision below:

- `broadcastList` also answers the room member token a participant joined the meeting with (one that
  names the participant), whatever its `meetingRead`, since that participant already receives every
  broadcast of the meeting through the meeting's signals. `broadcastGet` and `meetingGet` keep requiring
  `meetingRead`, and a token of another room keeps getting `403`.
- The catch-up after a reconnect then works for every participant: a broadcast that ended meanwhile is
  settled and reported, as it already is for a participant holding `meetingRead`.
- A catch-up that still fails (the server unreachable) keeps the broadcasts as last known, as today, so
  the LIVE mark never disappears while the meeting may still be streamed.
- No delta of its own: `live-broadcast` is still being added by `add-live-broadcast`, whose requirement
  "Reading broadcasts" (its scenario "Token holding meetingJoin alone") changes, and whose requirement
  "Live status shown to every participant" gets a reconnect scenario.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task updates the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- REST API: `broadcastList` (public, unreleased) accepts one more kind of caller; additive. The OpenAPI
  description of who may call it changes.
- Meeting UI: the LIVE chip and the Live broadcast activity after a reconnect, for participants without
  `meetingRead`.
- Embedded API: `broadcastEnded` now reaches the host of such a participant after a reconnect; no
  contract change.
- Webhooks, console UI, deployment configuration: not affected.
- Code: `meet-ce/backend/src/routes/broadcast.routes.ts` and `meet-ce/backend/src/middlewares/room.middleware.ts`;
  the frontend resync (`onRoomReconnected` in `meeting-event-handler.service.ts`) is unchanged.
- openvidu.io: the regenerated REST API reference.

## Decisions to confirm

- How a participant without `meetingRead` catches up on the broadcasts after a reconnect. Proposed:
  `broadcastList` accepts the room member token a participant joined with, as `withRoomPermissionForOthers`
  already lets a participant act on themselves without the permission. Alternative: keep `meetingRead`
  and carry the broadcasts in progress in the LiveKit room's metadata, which every client gets back on
  reconnecting with no request and no permission, at the cost of reworking how broadcasts reach the
  meeting; or accept the gap and say so in the spec.
- Whether a catch-up that cannot read the broadcasts settles the ones it cannot confirm. Proposed: no,
  they stay shown: a LIVE mark that outlives a broadcast is the safer error while the meeting may still be
  streamed. Alternative: settle them as ended with an unknown outcome.

## Source

3.10.0 pre-release audit, finding BF-6 (low, verified-live), introduced by #120.
