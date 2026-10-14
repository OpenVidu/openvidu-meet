# Proposal

## Why

`createAiAssistant` refuses to start the live captions assistant when the deployment has captions off (`MEET_CAPTIONS_ENABLED` not `true`) or the caller's room has `captions.enabled` set to `false`, but it refuses with a `500` "Configuration Error". The request is well formed and the server is healthy: the caller asked for a feature that is turned off, which the other per-room feature switches (`raiseHand.enabled`, `reactions.enabled`) answer with `403`. A `500` also lands in error monitoring as a server fault.

## What Changes

- `createAiAssistant` answers `403` when captions are off for the deployment or for the room, with a message naming which switch is off, and starts nothing.
- The internal OpenAPI documents that `403`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-captions`: the requirement "No assistant while captions are disabled" names the `403`.

## Impact

- Internal REST API: `createAiAssistant` answers `403` instead of `500` when captions are off. The internal API has no compatibility promise; the meeting UI treats any failure as "captions stay off" (`live-captions` "Turning captions off" / "The server refuses to start"), so it is unaffected.
- Webhooks, embedded API, console UI, deployment configuration: not affected.
- openvidu.io: no page changes.

## Decisions to confirm

- Both the deployment switch and the room switch answer `403`, like `raiseHand.enabled` and `reactions.enabled` (alternative: `409` for the room switch, as a room state conflict, and `403` only for the deployment switch).
