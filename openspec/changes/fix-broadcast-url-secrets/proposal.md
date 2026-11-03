# Proposal

## Why

A destination URL with a user and password in it is accepted, and the password is served in clear by the
room config and written to the server log, although the media server cannot stream to such a URL. A
query string attached to the stream key is only partly masked when it contains a slash, and a URL with an
invalid percent escape is saved, then fails at the start with a 500 that writes the whole stream key to
three logs.

## What Changes

- Saving a destination whose URL has user information (`user:password@host`) or a `%` not followed by two
  hexadecimal digits is refused with `422`, at room create, room update and start, since the media server
  cannot stream to either.
- The stream key redaction masks the key together with the whole query string, whatever the query
  contains, so nothing after the key is served or logged.
- The failed calls to the media server (`startRoomComposite`, `updateStream`) log only their status and
  code, never the error message, which echoes the URL; the room creation log shows the redacted
  destinations.
- No delta of its own: "Stream keys are never served" of `add-live-broadcast` already states that the
  key and its query are masked and the logs carry no key; "Room destinations" ("422 to a malformed URL")
  gets the two new malformed shapes as scenarios through a task.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task updates the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- REST API: `createRoom`, `updateRoomConfig` and `broadcastStart` answer `422` to the two URL shapes
  above, which were accepted and could never stream; the redacted URL served for a query containing a
  slash changes. No field changes.
- Code: `isValidStreamUrl`, `redactStreamUrl` and `streamKeyIndex` in
  `meet-ce/typings/src/database/room-config.ts`, `livekit.service.ts` and `room.controller.ts` in
  `meet-ce/backend/src`.
- Meeting UI and console UI: the destination editors reuse `isValidStreamUrl`, so they refuse the same
  URLs; webhooks, embedded API, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Delivery: private advisory or regular public pull request.
- Whether rooms stored with a userinfo or bad-escape URL before this fix is migrated. Proposed: no
  migration; the rooms stay readable (redacted) and the start of that destination answers `422`.
  Alternative: a migration that drops such destinations.

## Source

3.10.0 pre-release audit, findings BB-2 (low, verified-live), BB-3 (low, verified-live) and BB-4 (low,
verified-live), introduced by #120.
