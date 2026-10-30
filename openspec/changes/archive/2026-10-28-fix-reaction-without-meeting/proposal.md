# Proposal

## Why

`participantReactionSend` checks the room and `reactions.enabled` and then asks the media server to relay the reaction; when the room has no meeting running, the relay is silently skipped and the endpoint still answers `200`. The caller is told the reaction was shown when nobody saw it, unlike the other live-meeting operations (`participantHandUpdate`, `participantMute`), which answer `404` without a meeting.

## What Changes

- `participantReactionSend` answers `404` (no active meeting, the same error the raise hand operations use) when the room exists but has no meeting running, and relays nothing.
- The internal OpenAPI documents that `404`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reactions`: the requirement "Send a reaction" states the `404` without a meeting.

## Impact

- Internal REST API: `participantReactionSend` answers `404` instead of `200` without a meeting. The internal API has no compatibility promise; its only client is the meeting UI, which sends reactions only from inside a meeting.
- Embedded API: the `participantReactionSend` command runs only inside a meeting; not affected.
- Webhooks, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: no page changes.

## Decisions to confirm

- No meeting answers `404` with the no-active-meeting error, as the hand operations do (alternative: `409`, since the room exists and only its state prevents the reaction).
