# Tasks

## 1. Check the destination URL as sent

- [x] 1.1 `destinationUrlSchema` in `meet-ce/backend/src/models/zod-schemas/broadcast.schema.ts` checks the `rtmp://`
  or `rtmps://` scheme with `URL.parse` instead of `z.url()`, so the form check sees the URL as sent, only trimmed.
- [x] 1.2 `tests/unit/models/broadcast-schemas.test.ts`: line breaks and tabs inside a URL are refused in the room
  config and in a start request, and a valid URL is kept exactly as sent.
- [x] 1.3 `tests/integration/api/rooms/broadcast-room-config.test.ts`: `createRoom` answers `422` and stores no room for
  such URLs.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. Live broadcast is new in the unreleased 3.10.0.
- [x] 2.2 openvidu.io: none.
