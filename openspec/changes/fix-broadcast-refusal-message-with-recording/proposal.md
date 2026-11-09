# Proposal

## Why

When a meeting is being recorded on a node that has room for one video compositor only, going live
fails with "No egress service is available", although the egress service is running. Moderators and
integrators are told the wrong reason.

## What Changes

- The `503` message says what is true: no egress service could take the request, because none is running
  or none has capacity ("No egress service could take the request (none running or none with capacity)").
  The error name and status do not change.
- The live broadcast documentation states that recording and broadcasting at once run two compositors,
  which a small node may not fit.
- No delta of its own: requirement "Broadcasts need an egress service" of `add-live-broadcast` fixes the
  status and error name, not the message.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Requirement "Broadcasts need an egress service" and its scenario "No egress
service running" keep holding.

## Impact

- REST API: the `message` of the `503` `LiveKit Error` of `broadcastStart`, `broadcastStop` and
  `startRecording`; the OpenAPI response description is reworded to match. Status and error name are
  unchanged.
- Meeting UI: shows the new message in the refusal banner.
- Code: `errorEgressNotAvailable` in `meet-ce/backend/src/models/error.model.ts`.
- Webhooks, embedded API, deployment configuration: not affected.
- openvidu.io: `docs/meet/features/meetings/live-broadcast.md` (two-compositor cost).

## Decisions to confirm

- Whether the broadcast keeps its own message apart from recordings. Proposed: one shared message, since
  the cause is the same for both. Alternative: a message per operation that names recording when the
  other egress is a recording.

## Source

3.10.0 pre-release audit, finding BB-9 (low, static-plausible), introduced by #120.
