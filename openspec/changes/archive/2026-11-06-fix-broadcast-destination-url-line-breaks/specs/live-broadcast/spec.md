## MODIFIED Requirements

### Requirement: Room destinations
A room's `broadcast.destinations` SHALL hold any number of destinations, each a `name` of 1 to 50 characters and an RTMP or RTMPS `url` of the form `rtmp(s)://{host}(/{path})/{app}/{stream_key}`, optionally followed by ` live=1`, whose stream key is what follows the last `/`. The server SHALL give each saved destination an `id`, and SHALL answer `422` to a malformed name or URL, a URL with user information, a malformed `%` escape or a line break or tab inside included, storing nothing. Whitespace around the whole URL SHALL be ignored, and a URL that is accepted SHALL be streamed to exactly as sent.

#### Scenario: Destination saved
- **WHEN** `createRoom` is called with `config.broadcast.destinations` holding `{ "name": "YouTube", "url": "rtmp://a.rtmp.youtube.com/live2/abcd-1234" }`
- **THEN** the room's destination carries a server-assigned `id`, the name `YouTube` and the URL `rtmp://a.rtmp.youtube.com/live2/********`

#### Scenario: URL without a stream key
- **WHEN** a destination is sent with the URL `rtmp://a.rtmp.youtube.com/live2/`
- **THEN** the server answers `422`

#### Scenario: Destination URL without a usable stream key
- **WHEN** `createRoom` is called with a destination URL that carries a `#`, has no host, or whose last path segment is only a query string
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: URL with user information
- **WHEN** `createRoom` is called with the destination URL `rtmp://user:pass@192.0.2.10/live/key1abcdefgh`
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: URL with a malformed escape
- **WHEN** a destination is sent with the URL `rtmp://172.18.0.1:1935/live/ab%zzKEY`
- **THEN** the server answers `422`

#### Scenario: URL with a line break inside
- **WHEN** `createRoom` is called with the destination URL `rtmp://a.rtmp.youtube.com/live2/abcd\n1234`, a line break inside its stream key
- **THEN** the REST API answers `422` and stores nothing
