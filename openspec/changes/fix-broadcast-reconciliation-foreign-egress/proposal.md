# Proposal

## Why

When two Meet instances share one media server, each one stops the live broadcasts of the other: it sees
an egress start in a room of its own kind, finds no record of it and stops it within seconds. The same
happens to a development or test backend running beside the main one.

## What Changes

- The server stops a stream egress it has no record of only when the room belongs to this Meet (the room
  exists in its database); an egress of a room unknown to this database is left alone.
- No delta of its own: "Nothing streams without its broadcast" of `add-live-broadcast` is about the
  streams of a meeting of this server; a task adds the scenario for a room that is not its own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task adds a scenario to the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Deployment: two Meet instances on one media server, or a second backend on the maintainer's local
  media server, stop interfering. One extra database read, only on the path of an egress with no record.
- REST API, webhooks, embedded API, UIs: not affected.
- Code: `handleEgressEvent` in `meet-ce/backend/src/services/broadcast.service.ts` and the caller in
  `livekit-webhook.service.ts`.
- With several replicas: the check reads the shared MongoDB, so every replica decides the same way.
- openvidu.io: none.

## Decisions to confirm

- What happens to an integrator's own RTMP egress on a room that is a Meet room of this database.
  Proposed: it is still stopped, as the spec intends (every stream of a meeting must have a broadcast).
  Alternative: only egresses carrying the stream tag Meet gives its URLs are stopped.

## Source

3.10.0 pre-release audit, finding BB-7 (low, static-high), introduced by #120.
