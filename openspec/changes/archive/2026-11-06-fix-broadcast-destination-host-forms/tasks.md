# Tasks

## 1. Read the destination host as the media server does

- [x] 1.1 `BroadcastHelper.assertDestinationsAllowed` in `meet-ce/backend/src/helpers/broadcast.helper.ts` checks and
  resolves the host of the URL read as a web address host (`hostOf`), not as written.
- [x] 1.2 `tests/unit/helpers/broadcast.helper.test.ts`: loopback and link-local hosts written with ideographic full
  stops, circled or fullwidth characters, percent escapes, IPv4 shorthands, a trailing dot or an IPv4-mapped IPv6
  address are refused, and a name written that way is resolved by the name it stands for.
- [x] 1.3 `tests/integration/api/rooms/broadcast-room-config.test.ts`: `createRoom` answers `422` and stores no room for
  `127。0。0。1`, fullwidth `169.254.169.254` and `ⓛocalhost`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. Live broadcast is new in the unreleased 3.10.0.
- [x] 2.2 openvidu.io: none.
