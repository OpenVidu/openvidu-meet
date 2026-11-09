# Proposal

## Why

Going live has no limit on destinations. A moderator, or anyone holding the room's anonymous moderator
link, can send one request with thousands of meeting destinations and make the media server push the
meeting to every one of them, saturating its uplink for every meeting on the deployment.

## What Changes

- Depending on the decision below, the server bounds what one meeting can stream to: a cap on the
  destinations of a start request and of a meeting, or a bandwidth budget per meeting.
- The destinations of a start request are resolved in parallel instead of one DNS lookup after the other,
  so a request with many unresolvable hosts no longer waits one resolver timeout each. This part does not
  depend on the decision.
- No delta of its own: `live-broadcast` is still being added by `add-live-broadcast`, whose requirements
  "Room destinations" ("any number of destinations") and "Destinations for one meeting in a start request"
  ("any number of destinations at once") are updated by a task once the decision is taken.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task updates the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- REST API: `broadcastStart` (and `createRoom` / `updateRoomConfig` for a cap on room destinations) can
  answer `422` for more destinations than allowed; an additive refusal, no field changes.
- Meeting UI and console UI: the destination editors may show the cap; depends on the decision.
- Code: `broadcast.schema.ts` and `broadcast.service.ts` in `meet-ce/backend/src`.
- Webhooks, embedded API, deployment configuration: not affected, unless the decision makes the cap a
  configuration value.
- openvidu.io: `docs/meet/features/meetings/live-broadcast.md` states the limit once decided.

## Decisions to confirm

- Open product question. Option A: a fixed cap on destinations per start request and per meeting (the
  value to be chosen), which replaces the 2026-10-21 "no destination limit" decision. Option B: a
  per-meeting bandwidth budget (destinations times the encoding bitrate), configurable by the operator.
  Option C: keep no limit and accept the cost.
- Whether the cap or budget is a deployment configuration value or a constant. Proposed: a constant, as
  with `maxParticipants`. Alternative: an environment variable per deployment.

## Source

3.10.0 pre-release audit, finding BB-1 (medium, static-high), introduced by #120.
