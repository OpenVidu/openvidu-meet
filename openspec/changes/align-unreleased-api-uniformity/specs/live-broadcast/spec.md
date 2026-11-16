## MODIFIED Requirements

### Requirement: Room destinations of a start request
A start request SHALL name the room destinations to stream to by their ids in `destinationIds`, each streamed to as saved. The server SHALL keep an omitted `destinationIds` apart from an empty one: omitted, it SHALL stream to every room destination not streamed to yet; empty, to none of them. It SHALL answer `422` to an id the room does not have, as a config request does.

#### Scenario: Only some room destinations
- **GIVEN** a room with destinations A and B and a meeting in progress
- **WHEN** `broadcastStart` is called with `destinationIds` holding only A
- **THEN** the REST API answers `201` with one broadcast, to A

#### Scenario: Only a destination for the meeting
- **GIVEN** a room with destinations A and B and a meeting in progress
- **WHEN** `broadcastStart` is called with an empty `destinationIds` and one destination in `destinations`
- **THEN** the REST API answers `201` with one broadcast, to that destination, and none to A or B

#### Scenario: Room destinations and one for the meeting
- **GIVEN** a room with destinations A and B and a meeting in progress
- **WHEN** `broadcastStart` is called without `destinationIds` and with one destination in `destinations`
- **THEN** the REST API answers `201` with three broadcasts: A, B and that destination

#### Scenario: Id of another room
- **WHEN** `broadcastStart` is called with a `destinationIds` entry the room does not have, such as the id of another room's destination
- **THEN** the REST API answers `422` and no broadcast starts

### Requirement: Live broadcast is enabled per room
The server SHALL start a broadcast in a room only while the room's `broadcast.enabled` config is `true`, and SHALL answer `broadcastStart` with `403` and error `Broadcast Error` otherwise. A new room SHALL have live broadcast disabled. Stopping and reading broadcasts SHALL not depend on the switch.

#### Scenario: Start refused in a room with live broadcast disabled
- **GIVEN** a room with `broadcast.enabled` set to `false` and a meeting in progress
- **WHEN** a caller holding `broadcastControl` calls `broadcastStart` for that room
- **THEN** the REST API answers `403` and no broadcast starts

#### Scenario: Room created without a broadcast config
- **WHEN** `roomCreate` is called without `config.broadcast`
- **THEN** the room's `broadcast` is disabled, with no destinations, layout `grid` and encoding `H264_720P_30`

### Requirement: Room destinations
A room's `broadcast.destinations` SHALL hold any number of destinations, each a `name` of 1 to 50 characters and an RTMP or RTMPS `url` of the form `rtmp(s)://{host}(/{path})/{app}/{stream_key}`, optionally followed by ` live=1`, whose stream key is what follows the last `/`. The server SHALL give each saved destination an `id`, and SHALL answer `422` to a malformed name or URL, a URL with user information, a malformed `%` escape or a line break or tab inside included, storing nothing. Whitespace around the whole URL SHALL be ignored, and a URL that is accepted SHALL be streamed to exactly as sent.

#### Scenario: Destination saved
- **WHEN** `roomCreate` is called with `config.broadcast.destinations` holding `{ "name": "YouTube", "url": "rtmp://a.rtmp.youtube.com/live2/abcd-1234" }`
- **THEN** the room's destination carries a server-assigned `id`, the name `YouTube` and the URL `rtmp://a.rtmp.youtube.com/live2/********`

#### Scenario: URL without a stream key
- **WHEN** a destination is sent with the URL `rtmp://a.rtmp.youtube.com/live2/`
- **THEN** the server answers `422`

#### Scenario: Destination URL without a usable stream key
- **WHEN** `roomCreate` is called with a destination URL that carries a `#`, has no host, or whose last path segment is only a query string
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: URL with user information
- **WHEN** `roomCreate` is called with the destination URL `rtmp://user:pass@192.0.2.10/live/key1abcdefgh`
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: URL with a malformed escape
- **WHEN** a destination is sent with the URL `rtmp://172.18.0.1:1935/live/ab%zzKEY`
- **THEN** the server answers `422`

#### Scenario: URL with a line break inside
- **WHEN** `roomCreate` is called with the destination URL `rtmp://a.rtmp.youtube.com/live2/abcd\n1234`, a line break inside its stream key
- **THEN** the REST API answers `422` and stores nothing

### Requirement: Live broadcast needs a destination
The server SHALL answer `422` with error `Broadcast Error`, storing nothing, to a `roomCreate` or `roomUpdateConfig` request whose resulting config has `broadcast.enabled` set to `true` and no destination, judging the destinations sent in the request or, when it sends none, the saved ones.

#### Scenario: Enabled without destinations
- **WHEN** `roomCreate` is called with `config.broadcast` `{ "enabled": true }`
- **THEN** the server answers `422` and no room is created

#### Scenario: Enabled with saved destinations
- **GIVEN** a room with live broadcast disabled and one saved destination
- **WHEN** `roomUpdateConfig` sends `config.broadcast` `{ "enabled": true }`
- **THEN** the server answers `200` and live broadcast is enabled with the saved destination

### Requirement: The destination list is replaced as a whole
A config update that omits `broadcast.destinations` SHALL keep the saved destinations; one that sends the list SHALL replace the whole list: a destination sent with its `id` SHALL keep its identity with the name and URL sent, one without `id` SHALL be new, and a saved one left out SHALL be removed. An `id` the room does not have SHALL be answered with `422`.

#### Scenario: One destination removed
- **GIVEN** a room with destinations A and B
- **WHEN** `roomUpdateConfig` sends `broadcast.destinations` holding only A, with its `id`
- **THEN** the room keeps A, with the same `id`, and no longer has B

#### Scenario: Layout changed alone
- **GIVEN** a room with two saved destinations
- **WHEN** `roomUpdateConfig` sends `config.broadcast` `{ "enabled": true, "layout": "speaker" }`
- **THEN** the room's layout is `speaker` and both destinations are kept

### Requirement: Stream keys are never served
The server SHALL never serve a destination's stream key: every response, webhook payload and embedded event, a room's config included, SHALL carry each destination URL with its stream key, what follows the last `/`, and any query string attached to it, slashes included, replaced by `********`, and the server logs SHALL not contain the stream keys either.

#### Scenario: Room read back
- **GIVEN** a room whose destination URL is `rtmp://a.rtmp.youtube.com/live2/abcd-1234`
- **WHEN** `roomGetConfig` is called for it
- **THEN** the destination URL is `rtmp://a.rtmp.youtube.com/live2/********`

#### Scenario: Meeting started webhook
- **WHEN** a meeting starts in that room
- **THEN** the room in the `meetingStarted` payload carries the redacted URL

#### Scenario: Broadcast payload
- **WHEN** a broadcast to that destination starts
- **THEN** the broadcast's `destination.url` in the response, the webhooks and the embedded events is the redacted URL

#### Scenario: Query containing a slash
- **GIVEN** a room whose destination URL is `rtmp://192.0.2.11/live/stream?token=abc/def`
- **WHEN** `roomGetConfig` is called for it
- **THEN** the destination URL is `rtmp://192.0.2.11/live/********`

### Requirement: A redacted URL sent back keeps the saved key
A destination sent with its `id` and its redacted URL exactly as the server serves it SHALL keep its saved URL, stream key included. A redacted URL with any other change, such as another host or path, and a redacted URL on a destination without `id`, SHALL be answered with `422`, since there is no stream key to go with it.

#### Scenario: Config echoed back
- **GIVEN** a room's config as `roomGetConfig` returned it
- **WHEN** a client sends it back unchanged through `roomUpdateConfig`
- **THEN** the server answers `200` and the meeting still streams with the saved stream keys

#### Scenario: Host changed on a redacted URL
- **WHEN** `roomUpdateConfig` sends a destination with its `id` and the URL `rtmp://other.example.com/live2/********`
- **THEN** the server answers `422`

### Requirement: Broadcast layout and encoding
Each broadcast SHALL stream the meeting with the room's `broadcast.layout` (`grid`, `speaker` or `single-speaker`, `grid` by default) and `broadcast.encoding` (an encoding preset or a complete set of video and audio options, `H264_720P_30` by default), with the same values recordings accept, and SHALL report the layout and encoding it streams with.

#### Scenario: Speaker layout
- **GIVEN** a room whose `broadcast.layout` is `speaker`
- **WHEN** a broadcast starts in its meeting
- **THEN** the broadcast reports layout `speaker` and its destination receives the speaker layout

#### Scenario: Incomplete encoding options
- **WHEN** `roomUpdateConfig` sends a `broadcast.encoding` object without its audio part
- **THEN** the server answers `422`

### Requirement: Destinations where no RTMP server can live
The server SHALL answer `422` to a room destination, and to a destination of a start request, whose host is or resolves to a loopback, link-local, unspecified, multicast or broadcast address, judging the host as the media server reads it: percent escapes decoded, characters that stand for others mapped to them (such as the ideographic full stop in `127。0。0。1` or fullwidth digits), IPv4 shorthands expanded (`0x7f.1`, `2130706433`) and a trailing dot ignored, so the media server never streams to its own host or the cloud metadata endpoint. It SHALL accept private network addresses and hosts that do not resolve.

#### Scenario: Destination on the media server's own host
- **WHEN** `roomCreate` is called with a destination URL `rtmp://127.0.0.1:1935/live/key`
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: Meeting destination on the cloud metadata address
- **GIVEN** a meeting in progress
- **WHEN** `broadcastStart` is called with `{ "name": "Metadata", "url": "rtmp://169.254.169.254/live/key" }`
- **THEN** the REST API answers `422` and no broadcast starts

#### Scenario: Destination on a private network
- **WHEN** `roomCreate` is called with a destination URL `rtmp://10.0.0.7/live/key`
- **THEN** the room is created with that destination

#### Scenario: Loopback written with other characters
- **WHEN** `roomCreate` is called with a destination URL `rtmp://127。0。0。1:1935/live/key`, whose host is written with ideographic full stops
- **THEN** the REST API answers `422` and stores nothing

#### Scenario: Host name written with other characters
- **GIVEN** a host name that resolves to a loopback address
- **WHEN** a destination names it with a percent escape or a circled letter in place of one of its letters
- **THEN** the REST API answers `422`

### Requirement: One stream key per meeting
Two destinations of a room, and two broadcasts in progress in a meeting, SHALL never share a stream key (what follows the last `/` of the URL), whatever their servers, since the media server tells the streams of a meeting apart by it alone. The server SHALL answer `422` to a config or start request holding two such destinations, and `409` to a start request for a destination whose stream key the meeting already streams to.

#### Scenario: Destination already streamed
- **GIVEN** a meeting streaming to room destination A
- **WHEN** `broadcastStart` is called with `destinationIds` holding A
- **THEN** the REST API answers `409`

#### Scenario: Same stream key on another server
- **GIVEN** a meeting streaming to `rtmp://a.example.com/live/key-1`
- **WHEN** `broadcastStart` is called for `rtmp://b.example.com/app/key-1`
- **THEN** the REST API answers `409`

#### Scenario: Room config with a mirrored key
- **WHEN** `roomUpdateConfig` sends two destinations `rtmp://a.example.com/live/key-1` and `rtmp://b.example.com/app/key-1`
- **THEN** the server answers `422` and the stored destinations are unchanged

### Requirement: Broadcasts need an egress service
`broadcastStart` and `broadcastStop` SHALL answer `503` with error `LiveKit Error` when no egress service of the deployment takes the request, starting or stopping nothing, and `broadcastBulkStop` SHALL report each broadcast it could not stop for that reason in `failed`. Broadcasts need the OpenVidu egress, which reports each stream with the tag the server gives its URL: against an egress that does not, `broadcastStart` SHALL answer `500` and withdraw what it added, so nothing streams.

#### Scenario: No egress service running
- **GIVEN** a deployment whose egress service is down
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `503` and no broadcast is in progress

#### Scenario: Egress without stream tags
- **GIVEN** a deployment whose egress service does not report stream tags
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `500`, no broadcast is in progress and nothing is streamed

### Requirement: Stopping several broadcasts
`DELETE /api/v1/broadcasts?broadcastIds=` (`broadcastBulkStop`) SHALL take a comma-separated list of at most 100 distinct broadcast identifiers, accept an API key or a room member token, and stop each broadcast on its own as `broadcastStop` does. It SHALL answer `200` when every broadcast named stopped and `400` otherwise, listing the ones stopped in `deleted`. An empty list, or one longer than 100 identifiers, SHALL answer `422`.

#### Scenario: Stop two broadcasts
- **GIVEN** a meeting streaming to destinations A and B
- **WHEN** `broadcastBulkStop` is called with the broadcasts to A and B
- **THEN** the REST API answers `200` with both in `deleted` and an empty `failed`, and both broadcasts end

#### Scenario: No broadcast named
- **WHEN** `broadcastBulkStop` is called with an empty `broadcastIds`
- **THEN** the REST API answers `422`

### Requirement: Each broadcast of a bulk stop fails alone
`broadcastBulkStop` SHALL check `broadcastControl` in the room of each broadcast, and list in `failed`, with the reason, each one it could not stop because the caller lacks that permission, it is not in progress, it is already `ending` or LiveKit refused the stop, without undoing the others.

#### Scenario: One broadcast already over
- **GIVEN** a meeting streaming to destination B, whose broadcast to destination A already ended
- **WHEN** `broadcastBulkStop` is called with the broadcasts to A and B
- **THEN** the REST API answers `400` with B in `deleted` and A in `failed`, and the broadcast to B ends

#### Scenario: Token without the permission
- **GIVEN** a broadcast in progress in room A
- **WHEN** `broadcastBulkStop` is called for it with a room member token of room A lacking `broadcastControl`, or with a token of another room
- **THEN** the REST API answers `400` with the broadcast in `failed`, and the broadcast goes on

## ADDED Requirements

### Requirement: Broadcast conflicts carry a code
`broadcastStart` and `broadcastStop` SHALL answer each `409` with a snake_case code in `error` that tells its cause apart: `destination_in_use`, `already_broadcasting`, `no_participants` or `broadcast_busy` for a start, and `broadcast_ending` or `broadcast_busy` for a stop. The other refusals of the broadcast operations SHALL keep the error `Broadcast Error`.

#### Scenario: Start in a meeting without participants
- **GIVEN** a room with live broadcast enabled whose meeting has no participants
- **WHEN** `broadcastStart` is called for it
- **THEN** the REST API answers `409` with error `no_participants`

#### Scenario: Stop of a broadcast being stopped
- **GIVEN** a broadcast still `ending` after a stop
- **WHEN** `broadcastStop` is called for it again
- **THEN** the REST API answers `409` with error `broadcast_ending`
