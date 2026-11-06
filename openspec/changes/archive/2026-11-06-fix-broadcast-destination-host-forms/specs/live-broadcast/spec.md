## MODIFIED Requirements

### Requirement: Destinations where no RTMP server can live
The server SHALL answer `422` to a room destination, and to a destination of a start request, whose host is or resolves to a loopback, link-local, unspecified, multicast or broadcast address, judging the host as the media server reads it: percent escapes decoded, characters that stand for others mapped to them (such as the ideographic full stop in `127。0。0。1` or fullwidth digits), IPv4 shorthands expanded (`0x7f.1`, `2130706433`) and a trailing dot ignored, so the media server never streams to its own host or the cloud metadata endpoint. It SHALL accept private network addresses and hosts that do not resolve.

#### Scenario: Destination on the media server's own host
- **WHEN** `createRoom` is called with a destination URL `rtmp://127.0.0.1:1935/live/key`
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: Meeting destination on the cloud metadata address
- **GIVEN** a meeting in progress
- **WHEN** `broadcastStart` is called with `{ "name": "Metadata", "url": "rtmp://169.254.169.254/live/key" }`
- **THEN** the REST API answers `422` and no broadcast starts

#### Scenario: Destination on a private network
- **WHEN** `createRoom` is called with a destination URL `rtmp://10.0.0.7/live/key`
- **THEN** the room is created with that destination

#### Scenario: Loopback written with other characters
- **WHEN** `createRoom` is called with a destination URL `rtmp://127。0。0。1:1935/live/key`, whose host is written with ideographic full stops
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: Host name written with other characters
- **GIVEN** a host name that resolves to a loopback address
- **WHEN** a destination names it with a percent escape or a circled letter in place of one of its letters
- **THEN** the REST API answers `422`
