# Proposal

## Why

A reaction sent with a room member token whose participant is not in the meeting (never connected, already left, or kicked with a token still valid) is accepted with `200` and relayed to everyone, whose clients drop it. The `reactions` spec accepts reactions only from a participant of the meeting.

## What Changes

- `POST /internal-api/v1/meetings/{roomId}/reactions` checks that the sender is a participant of the meeting and relays nothing otherwise: `403` when the meeting runs and the sender is not in it, `404` when no meeting runs.
- No spec change: the fix makes "Who may send a reaction" hold ("names no participant" answers `403`), with its scenario "Token that does not join the meeting", and "Send a reaction" keeps `404` when no meeting runs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `reactions` "Who may send a reaction" and "Send a reaction".

## Impact

- REST API: the reactions endpoint (internal, no compatibility promise) answers `403` instead of `200` for an absent sender.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- Code: `sendParticipantReaction` of `meeting.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- How an absent sender is told from a missing meeting. Proposed: `404` when the room has no active meeting (from the room read the request already does) and `403` when it has and the sender is absent, as both specs say. Alternative: one LiveKit lookup of the sender and `404` for both cases, with the `reactions` scenario changed to match.

## Source

3.10.0 pre-release audit, finding IM-7 (low, verified-live), introduced by #117.
