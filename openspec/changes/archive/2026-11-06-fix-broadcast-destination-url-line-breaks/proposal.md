# Proposal

## Why

A destination URL with a line break or a tab inside, such as `rtmp://host/live/abcd\n1234`, is accepted and saved
without them, as `rtmp://host/live/abcd1234`. The stream key Meet streams to is then not the one the client sent,
and the broadcast fails at the platform with no hint of why. The form check already refuses whitespace, but it runs
on the output of the URL validator, which drops line breaks and tabs before the check sees them. The same holds for
the destinations of a `broadcastStart` request.

Found by the 2026-11-06 black-box probe of the 3.10 features.

## What Changes

- A destination URL with a line break or a tab inside, in a room's `config.broadcast.destinations` or in the
  `destinations` of `broadcastStart`, answers `422` with the form error, storing and streaming nothing.
- Whitespace around the whole URL is still ignored, and a URL that is accepted is kept exactly as sent.
- The error messages are unchanged: a URL that is not `rtmp://` or `rtmps://` still gets its own message next to the
  form one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-broadcast`: "Room destinations" lists a line break or tab inside the URL among the malformed URLs.

## Impact

- REST API: `createRoom`, `updateRoomConfig` and `broadcastStart` answer `422` to such a URL instead of saving or
  streaming it altered. The OpenAPI already lists `422`; no contract change.
- Webhooks, embedded API (`broadcastStart` sends the same body), meeting UI, console UI, deployment configuration:
  not affected.
- Code: the destination URL schema in `meet-ce/backend/src/models/zod-schemas/broadcast.schema.ts`.
- openvidu.io: none.
