## Purpose

Live broadcast streams a meeting, as it happens, to RTMP destinations outside Meet such as YouTube, Twitch or an own media server, one broadcast per destination. Room managers save a room's default destinations, moderators and host applications take the meeting live and stop it, and every participant and integrator learns when the meeting is being streamed and where.

Surfaces: REST API under `/api/v1/broadcasts` (`broadcastStart`, `broadcastList`, `broadcastGet`, `broadcastStop`, `broadcastBulkStop`; `meet-ce/backend/openapi/broadcasts/`), room config `broadcast.*` (`meet-ce/backend/openapi/rooms/schemas/meet-room-config.yaml`, typings `meet-ce/typings/src/database/room-config.ts`), webhooks `broadcastStarted`, `broadcastUpdated` and `broadcastEnded`, embedded commands `broadcastStart` and `broadcastStop` and events of the same three names (`meet-ce/typings/src/embedded/`), permissions `broadcastControl` and `broadcastAddDestinations`, the meeting (activities panel, More options, status rail, notices) and the console room wizard (Live broadcast and Room Access steps). Documented in openvidu.io `docs/meet/features/meetings/live-broadcast.md`.

## ADDED Requirements

### Requirement: Live broadcast is enabled per room
The server SHALL start a broadcast in a room only while the room's `broadcast.enabled` config is `true`, and SHALL answer `broadcastStart` with `403` and error `Broadcast Error` otherwise. A new room SHALL have live broadcast disabled. Stopping and reading broadcasts SHALL not depend on the switch.

#### Scenario: Start refused in a room with live broadcast disabled
- **GIVEN** a room with `broadcast.enabled` set to `false` and a meeting in progress
- **WHEN** a caller holding `broadcastControl` calls `broadcastStart` for that room
- **THEN** the REST API answers `403` and no broadcast starts

#### Scenario: Room created without a broadcast config
- **WHEN** `createRoom` is called without `config.broadcast`
- **THEN** the room's `broadcast` is disabled, with no destinations, layout `grid` and encoding `H264_720P_30`

### Requirement: Room destinations
A room's `broadcast.destinations` SHALL hold at most five destinations, each a `name` of 1 to 50 characters and an RTMP or RTMPS `url` of the form `rtmp(s)://{host}(/{path})/{app}/{stream_key}`, optionally followed by ` live=1`. The server SHALL give each saved destination an `id`, and SHALL answer `422` to a sixth destination or a malformed name or URL, storing nothing.

#### Scenario: Destination saved
- **WHEN** `createRoom` is called with `config.broadcast.destinations` holding `{ "name": "YouTube", "url": "rtmp://a.rtmp.youtube.com/live2/abcd-1234" }`
- **THEN** the room's destination carries a server-assigned `id`, the name `YouTube` and the URL `rtmp://a.rtmp.youtube.com/live2/********`

#### Scenario: URL without a stream key
- **WHEN** a destination is sent with the URL `rtmp://a.rtmp.youtube.com/live2/`
- **THEN** the server answers `422`

#### Scenario: Six destinations
- **WHEN** `updateRoomConfig` sends six destinations
- **THEN** the server answers `422` and the stored destinations are unchanged

### Requirement: Live broadcast needs a destination
The server SHALL answer `422` with error `Broadcast Error`, storing nothing, to a `createRoom` or `updateRoomConfig` request whose resulting config has `broadcast.enabled` set to `true` and no destination, judging the destinations sent in the request or, when it sends none, the saved ones.

#### Scenario: Enabled without destinations
- **WHEN** `createRoom` is called with `config.broadcast` `{ "enabled": true }`
- **THEN** the server answers `422` and no room is created

#### Scenario: Enabled with saved destinations
- **GIVEN** a room with live broadcast disabled and one saved destination
- **WHEN** `updateRoomConfig` sends `config.broadcast` `{ "enabled": true }`
- **THEN** the server answers `200` and live broadcast is enabled with the saved destination

### Requirement: The destination list is replaced as a whole
A config update that omits `broadcast.destinations` SHALL keep the saved destinations; one that sends the list SHALL replace the whole list: a destination sent with its `id` SHALL keep its identity with the name and URL sent, one without `id` SHALL be new, and a saved one left out SHALL be removed. An `id` the room does not have SHALL be answered with `422`.

#### Scenario: One destination removed
- **GIVEN** a room with destinations A and B
- **WHEN** `updateRoomConfig` sends `broadcast.destinations` holding only A, with its `id`
- **THEN** the room keeps A, with the same `id`, and no longer has B

#### Scenario: Layout changed alone
- **GIVEN** a room with two saved destinations
- **WHEN** `updateRoomConfig` sends `config.broadcast` `{ "enabled": true, "layout": "speaker" }`
- **THEN** the room's layout is `speaker` and both destinations are kept

### Requirement: Stream keys are never served
The server SHALL never serve a destination's stream key: every response, webhook payload and embedded event, a room's config included, SHALL carry each destination URL with its last path segment replaced by `********` and without query string, and the server logs SHALL not contain the stream keys either.

#### Scenario: Room read back
- **GIVEN** a room whose destination URL is `rtmp://a.rtmp.youtube.com/live2/abcd-1234`
- **WHEN** `getRoomConfig` is called for it
- **THEN** the destination URL is `rtmp://a.rtmp.youtube.com/live2/********`

#### Scenario: Meeting started webhook
- **WHEN** a meeting starts in that room
- **THEN** the room in the `meetingStarted` payload carries the redacted URL

#### Scenario: Broadcast payload
- **WHEN** a broadcast to that destination starts
- **THEN** the broadcast's `url` in the response, the webhooks and the embedded events is the redacted URL

### Requirement: A redacted URL sent back keeps the saved key
A destination sent with its `id` and its redacted URL exactly as the server serves it SHALL keep its saved URL, stream key included. A redacted URL with any other change, such as another host or path, and a redacted URL on a destination without `id`, SHALL be answered with `422`, since there is no stream key to go with it.

#### Scenario: Config echoed back
- **GIVEN** a room's config as `getRoomConfig` returned it
- **WHEN** a client sends it back unchanged through `updateRoomConfig`
- **THEN** the server answers `200` and the meeting still streams with the saved stream keys

#### Scenario: Host changed on a redacted URL
- **WHEN** `updateRoomConfig` sends a destination with its `id` and the URL `rtmp://other.example.com/live2/********`
- **THEN** the server answers `422`

### Requirement: Live broadcast and end-to-end encryption exclude each other
The server SHALL store `broadcast.enabled` as `false` whenever the room's `e2ee.enabled` is `true`, both when the room is created and on every config update, so an encrypted meeting is never streamed.

#### Scenario: Encryption enabled on a room that broadcasts
- **GIVEN** a room with live broadcast enabled
- **WHEN** its config is updated with only `e2ee.enabled` set to `true`
- **THEN** the stored room config has `broadcast.enabled` set to `false` and keeps its destinations

### Requirement: Broadcast layout and encoding
Each broadcast SHALL stream the meeting with the room's `broadcast.layout` (`grid`, `speaker` or `single-speaker`, `grid` by default) and `broadcast.encoding` (an encoding preset or a complete set of video and audio options, `H264_720P_30` by default), with the same values recordings accept, and SHALL report the layout and encoding it streams with.

#### Scenario: Speaker layout
- **GIVEN** a room whose `broadcast.layout` is `speaker`
- **WHEN** a broadcast starts in its meeting
- **THEN** the broadcast reports layout `speaker` and its destination receives the speaker layout

#### Scenario: Incomplete encoding options
- **WHEN** `updateRoomConfig` sends a `broadcast.encoding` object without its audio part
- **THEN** the server answers `422`

### Requirement: Starting broadcasts
`broadcastStart` SHALL take the `roomId` of the meeting to stream in its body and accept an API key or a room member token holding `broadcastControl` in that room, start one broadcast per destination and answer `201` with them, each `starting`, without waiting for media. Without `destinations` it SHALL stream to every room destination not streamed to yet, `409` when none is left. It SHALL answer `404` for an unknown room and `409` when nobody is connected.

#### Scenario: Go live to every room destination
- **GIVEN** a room with two destinations and a meeting in progress
- **WHEN** a moderator holding `broadcastControl` calls `broadcastStart` with only the room's `roomId`
- **THEN** the REST API answers `201` with two broadcasts in the `starting` status, one per destination

#### Scenario: Every destination already streamed
- **GIVEN** a meeting that streams to every destination of its room
- **WHEN** `broadcastStart` is called without `destinations`
- **THEN** the REST API answers `409`

#### Scenario: Nobody connected
- **GIVEN** a room with live broadcast enabled and nobody connected
- **WHEN** `broadcastStart` is called for it
- **THEN** the REST API answers `409`

#### Scenario: Token without the permission
- **WHEN** `broadcastStart` is called with a room member token lacking `broadcastControl`, or issued for another room
- **THEN** the REST API answers `403`

### Requirement: Destinations of a start request
Each entry of `destinations` SHALL be either the `destinationId` of a room destination alone, streamed to as saved, or a `name` and a full `url` for that meeting only. The server SHALL answer `422` to an entry mixing both forms, an unknown `destinationId`, a redacted URL or more than five broadcasts in progress at once.

#### Scenario: Room destination with a changed URL
- **WHEN** `broadcastStart` is called with an entry carrying a `destinationId` and a `url`
- **THEN** the REST API answers `422`: a room destination is never changed for a meeting

#### Scenario: Sixth broadcast
- **GIVEN** a meeting with five broadcasts in progress
- **WHEN** `broadcastStart` is called for one more destination
- **THEN** the REST API answers `422`

### Requirement: One stream key per meeting
Two destinations of a room, and two broadcasts in progress in a meeting, SHALL never share a stream key (what follows the last `/` of the URL), whatever their servers, since the media server tells the streams of a meeting apart by it alone. The server SHALL answer `422` to a config or start request holding two such destinations, and `409` to a start request for a destination whose stream key the meeting already streams to.

#### Scenario: Destination already streamed
- **GIVEN** a meeting streaming to room destination A
- **WHEN** `broadcastStart` is called with `destinationId` A
- **THEN** the REST API answers `409`

#### Scenario: Same stream key on another server
- **GIVEN** a meeting streaming to `rtmp://a.example.com/live/key-1`
- **WHEN** `broadcastStart` is called for `rtmp://b.example.com/app/key-1`
- **THEN** the REST API answers `409`

#### Scenario: Room config with a mirrored key
- **WHEN** `updateRoomConfig` sends two destinations `rtmp://a.example.com/live/key-1` and `rtmp://b.example.com/app/key-1`
- **THEN** the server answers `422` and the stored destinations are unchanged

### Requirement: Destinations for one meeting need their own permission
A start request that holds any entry with a `name` and a `url` SHALL also require `broadcastAddDestinations`, checked before the body is judged against the meeting: without it the server SHALL answer `403` and start nothing. Room destinations SHALL need only `broadcastControl`.

#### Scenario: Moderator limited to the room destinations
- **GIVEN** a participant holding `broadcastControl` but not `broadcastAddDestinations`
- **WHEN** they call `broadcastStart` with a room destination and a destination given by name and URL
- **THEN** the REST API answers `403` and no broadcast starts

#### Scenario: Room destination only
- **GIVEN** the same participant
- **WHEN** they call `broadcastStart` with only the `destinationId` of a room destination
- **THEN** the REST API answers `201`

### Requirement: Every broadcast of a start begins or none does
When the media server refuses one of the destinations of a start request, the server SHALL withdraw the ones of that request it had already added and answer with the error, so a start request starts every broadcast it asks for or none.

#### Scenario: Second destination refused
- **GIVEN** a meeting with no broadcast
- **WHEN** `broadcastStart` asks for two destinations and the media server refuses the second
- **THEN** the request fails and no broadcast is in progress in the meeting

### Requirement: Nothing streams without its broadcast
The server SHALL stop every stream of a meeting that no broadcast reports, whenever it learns of one: a destination the media server took although the request that asked for it failed, and an egress the media server started after the request gave up or its replica stopped before saving the broadcast. A destination SHALL never receive the meeting without a broadcast that reports it and can stop it.

#### Scenario: Start answered too late
- **GIVEN** a start request whose call to the media server timed out, so it answered an error
- **WHEN** the media server starts streaming to that destination afterwards
- **THEN** the server stops that stream as soon as the media server reports it, and no broadcast is listed

#### Scenario: Destination taken by a failed request
- **GIVEN** a meeting streaming to destination A
- **WHEN** a start request for destination B fails after the media server took B
- **THEN** the server withdraws B and the meeting streams to A only

### Requirement: Broadcast statuses
Each broadcast SHALL move only forward through `starting`, `active` and `ending` to one final status: `complete`, `failed`, `aborted` or `limit_reached`. It SHALL stay `starting` until its destination receives media, become `active` with its `startDate` at that moment, and end `failed`, with `error` saying why, when the destination rejects or loses the stream. A broadcast ending SHALL leave the others going.

#### Scenario: Destination reached
- **WHEN** a broadcast starts and its destination begins receiving the meeting
- **THEN** the broadcast goes from `starting` to `active` and carries a `startDate`

#### Scenario: Destination rejects the stream
- **GIVEN** a meeting streaming to destinations A and B
- **WHEN** destination B rejects its stream key
- **THEN** the broadcast to B ends `failed` with an `error`
- **AND** the broadcast to A stays `active`

### Requirement: Broadcast identifiers
Every broadcast SHALL be identified by a `broadcastId` of the form `{roomId}--{id}`, which names the room it belongs to as a recording's identifier does, so `broadcastGet` and `broadcastStop` take it alone. The server SHALL answer `422` to a malformed `broadcastId`, and `404` when it names a room that does not exist or a broadcast that is not in progress.

#### Scenario: Broadcast read by its id alone
- **GIVEN** a broadcast in progress in room `room-123`
- **WHEN** `broadcastGet` is called with its `broadcastId`
- **THEN** the REST API answers `200` with the broadcast, whose `roomId` is `room-123`

#### Scenario: Malformed identifier
- **WHEN** `broadcastStop` is called with `broadcastId` `kX9pL2mQ7a`
- **THEN** the REST API answers `422`

### Requirement: Stopping a broadcast
`broadcastStop` SHALL accept an API key or a room member token holding `broadcastControl` in the broadcast's room, end the stream to its destination at once while the other broadcasts go on, and answer `200` with the broadcast in its final state: `complete`, with `endDate` and `duration`, or `aborted`, without dates, when no media had reached its destination. It SHALL answer `409` for a broadcast already `ending`.

#### Scenario: Stop one destination
- **GIVEN** a meeting streaming to destinations A and B
- **WHEN** `broadcastStop` is called with the `broadcastId` of the broadcast to A
- **THEN** the REST API answers `200` with that broadcast `complete`, and the broadcast to B stays `active`

#### Scenario: Stop a broadcast still starting
- **GIVEN** a broadcast whose destination has not received media yet
- **WHEN** `broadcastStop` is called for it
- **THEN** it ends `aborted` without `startDate`, `endDate` nor `duration`

#### Scenario: Token without the permission
- **WHEN** `broadcastStop` is called with a room member token lacking `broadcastControl`
- **THEN** the REST API answers `403` and the broadcast goes on

### Requirement: Stopping several broadcasts
`broadcastBulkStop` SHALL take the `roomId` in its body, require `broadcastControl` in that room, and stop the broadcasts of that room named in `broadcastIds`, or every running one when none is named, answering `200` with each in its final state. A request naming a broadcast that is not in progress (`404`) or already `ending` (`409`) SHALL stop none of them.

#### Scenario: Stop the whole broadcast
- **GIVEN** a meeting streaming to destinations A and B
- **WHEN** `broadcastBulkStop` is called with only the room's `roomId`
- **THEN** the REST API answers `200` with both broadcasts in their final state

#### Scenario: Nothing running
- **GIVEN** a meeting with no broadcast in progress
- **WHEN** `broadcastBulkStop` is called without `broadcastIds`
- **THEN** the REST API answers `200` with no broadcast

#### Scenario: One unknown identifier
- **GIVEN** a meeting streaming to destination A
- **WHEN** `broadcastBulkStop` is called with the broadcast to A and an unknown `broadcastId`
- **THEN** the REST API answers `404` and the broadcast to A goes on

### Requirement: A destination can be streamed to again
Once the broadcast to a destination has ended, a new start to that destination SHALL be accepted and create a new broadcast, with its own `broadcastId`, while the meeting goes on.

#### Scenario: Restart after a stop
- **GIVEN** a meeting whose broadcast to room destination A was stopped
- **WHEN** `broadcastStart` is called with `destinationId` A
- **THEN** the REST API answers `201` with a new `broadcastId`

### Requirement: Reading broadcasts
`broadcastList` SHALL return the broadcasts in progress in the meeting of the room its required `roomId` query parameter names, and `broadcastGet` one broadcast, to an API key or a room member token holding `meetingRead` in that room; a broadcast that has ended SHALL leave the list and answer `404`. Every broadcast operation SHALL return only the fields asked for through `fields` or `X-Fields`.

#### Scenario: Ended broadcast
- **GIVEN** a broadcast that has been stopped
- **WHEN** `broadcastGet` is called for it
- **THEN** the REST API answers `404`

#### Scenario: Field selection
- **WHEN** `broadcastList` is called with `fields` `broadcastId,status`
- **THEN** each broadcast carries only `broadcastId` and `status`

#### Scenario: Token holding meetingJoin alone
- **WHEN** `broadcastList` is called with a room member token without `meetingRead`
- **THEN** the REST API answers `403`

#### Scenario: List without its room
- **WHEN** `broadcastList` is called without `roomId`
- **THEN** the REST API answers `422`

### Requirement: Broadcasts end with their meeting
When a meeting ends, the server SHALL end every broadcast still in progress in it, reporting each final status, `aborted` for one that never reached its destination, so no broadcast outlives its meeting. A broadcast SHALL otherwise stay in progress until it is stopped or fails, however long its meeting lasts.

#### Scenario: Meeting ended while live
- **GIVEN** a meeting streaming to two destinations
- **WHEN** the meeting ends
- **THEN** both broadcasts end and a `broadcastEnded` webhook is sent for each

#### Scenario: Meeting without a duration limit
- **GIVEN** a meeting of a room without `maxDurationMinutes`, streaming to a destination for more than 24 hours
- **WHEN** the destination drops and the media server reconnects it
- **THEN** the broadcast is still in progress and `broadcastList` returns it

### Requirement: A lost broadcast never blocks the room
When the egress service streaming a meeting stops responding, the server SHALL end its broadcasts `failed`, with the error `The egress service stopped responding`. Changes and ends that never reached the server, including the meeting's end, SHALL be settled at the next start request and by a reconciliation run at startup and every minute. The room SHALL be able to go live again, and no broadcast SHALL stay in progress past its egress or its meeting.

#### Scenario: Egress service killed while live
- **GIVEN** a meeting streaming to a destination
- **WHEN** the egress service running the broadcast dies
- **THEN** the broadcast ends `failed` and `broadcastEnded` is sent
- **AND** a new `broadcastStart` to that destination answers `201` while an egress service is available

#### Scenario: Egress service killed while the server was down
- **GIVEN** a meeting streaming to a destination
- **WHEN** the egress service dies while every replica of the server is down
- **THEN** within a minute of the server starting again, the broadcast ends `failed` and `broadcastEnded` is sent

#### Scenario: Meeting ended while the server was down
- **GIVEN** a meeting streaming to a destination
- **WHEN** the meeting ends while every replica of the server is down
- **THEN** within a minute of the server starting again, the broadcast ends and `broadcastEnded` is sent

### Requirement: Broadcasts need an egress service
`broadcastStart`, `broadcastStop` and `broadcastBulkStop` SHALL answer `503` with error `LiveKit Error` when no egress service of the deployment takes the request, starting nothing. Broadcasts need the OpenVidu egress, which reports each stream with the tag the server gives its URL: against an egress that does not, `broadcastStart` SHALL answer `500` and withdraw what it added, so nothing streams.

#### Scenario: No egress service running
- **GIVEN** a deployment whose egress service is down
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `503` and no broadcast is in progress

#### Scenario: Egress without stream tags
- **GIVEN** a deployment whose egress service does not report stream tags
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `500`, no broadcast is in progress and nothing is streamed

### Requirement: One change at a time per room across replicas
The server SHALL apply the start and stop requests and the media server events of a room's broadcasts one at a time, whichever replica receives them. A request SHALL wait up to 10 seconds for the change before it and SHALL answer `409` when that change holds the room's broadcasts for longer.

#### Scenario: Concurrent starts on two replicas
- **GIVEN** two Meet replicas and a meeting with no broadcast
- **WHEN** replica A and replica B each receive `broadcastStart` for the same room destination at the same time
- **THEN** one answers `201` and the other `409`
- **AND** the meeting streams to that destination once

#### Scenario: Status change received by another replica
- **GIVEN** a broadcast started through replica A
- **WHEN** replica B receives the media server event that the destination receives media
- **THEN** `broadcastGet` answers the broadcast `active` on either replica

### Requirement: Broadcast webhooks
The server SHALL send, per broadcast, `broadcastStarted` when a start request creates it, `broadcastUpdated` on each later change while it is in progress (to `active` or to `ending`), and `broadcastEnded` with its final status, each carrying the broadcast, and SHALL send no update that changes nothing. Delivery rules belong to `webhooks`.

#### Scenario: Started, updated and ended
- **GIVEN** a registered webhook endpoint subscribed to broadcast events
- **WHEN** a broadcast is started, reaches its destination and is stopped
- **THEN** the endpoint receives `broadcastStarted` with `starting`, `broadcastUpdated` with `active` and `broadcastEnded` with `complete`, all for the same `broadcastId`

#### Scenario: Two destinations
- **WHEN** a start request streams to two destinations
- **THEN** the endpoint receives one `broadcastStarted` for each broadcast

#### Scenario: Stream keys with the same ends
- **GIVEN** a meeting streaming to `rtmp://host/live/abcONExyz` and to `rtmp://host/live/abcTWOxyz`
- **WHEN** both destinations receive media
- **THEN** each broadcast gets its own `broadcastUpdated` with `active`

#### Scenario: Destination streamed to again
- **GIVEN** a meeting whose broadcast to destination A was stopped
- **WHEN** a new broadcast to A starts and A receives media
- **THEN** only the new broadcast gets `broadcastUpdated`, and the stopped one gets no further event

### Requirement: Embedded broadcast commands
The embedded element SHALL run `broadcastStart(options?)` and `broadcastStop(options?)`, whose payloads are the bodies of `broadcastStart` and `broadcastBulkStop` without the `roomId`, only for a local participant holding `broadcastControl` in a joined meeting. Without options they SHALL go live to every room destination not streamed to yet and stop every running broadcast. `broadcastStop` with nothing running SHALL do nothing.

#### Scenario: Go live from the host
- **GIVEN** a joined moderator holding `broadcastControl` in a room with two destinations
- **WHEN** the host calls `broadcastStart()`
- **THEN** the meeting goes live to both destinations

#### Scenario: Destination for the meeting without its permission
- **GIVEN** a joined participant holding `broadcastControl` but not `broadcastAddDestinations`
- **WHEN** the host calls `broadcastStart({ destinations: [{ name: "Own", url: "rtmp://media.example.com/live/key" }] })`
- **THEN** no broadcast starts and the browser console logs the server's refusal

#### Scenario: Participant without the permission
- **GIVEN** a joined speaker without `broadcastControl`
- **WHEN** the host calls `broadcastStop()`
- **THEN** nothing is stopped and the console warns that `broadcastControl` is missing

### Requirement: Embedded broadcast events
The embedded element SHALL dispatch to the host of every participant, whoever started or stopped the broadcast, `broadcastStarted` the first time it learns of a broadcast, `broadcastUpdated` on each later change and `broadcastEnded` with the final state, each carrying the broadcast. A participant joining while broadcasts are in progress SHALL receive one `broadcastStarted` for each of them.

#### Scenario: Broadcast started by another participant
- **GIVEN** an embedded speaker in a meeting
- **WHEN** a moderator goes live to one destination and later stops it
- **THEN** the speaker's host receives `broadcastStarted`, `broadcastUpdated` with `active` and `broadcastEnded` with `complete` for the same `broadcastId`

#### Scenario: Joining a live meeting
- **GIVEN** a meeting streaming to two destinations
- **WHEN** an embedded participant joins
- **THEN** the host receives two `broadcastStarted` events, one per broadcast, each with its current status

### Requirement: Live status shown to every participant
The meeting SHALL show every participant a `LIVE` mark in the status rail while a broadcast is starting, active or ending, saying Starting until a destination receives media and then the time since the earliest live destination began, plus a notice when the meeting first goes live and another when nothing is streamed anymore. The status SHALL start over with each meeting entry.

#### Scenario: Participant joining a live meeting
- **GIVEN** a meeting streaming to a destination
- **WHEN** a participant joins
- **THEN** the participant sees the `LIVE` mark with the time on air and the notice that the meeting is live

#### Scenario: Last destination stopped
- **GIVEN** a meeting streaming to one destination
- **WHEN** that broadcast is stopped
- **THEN** the `LIVE` mark disappears and every participant sees the notice that the live broadcast ended

### Requirement: Live broadcast activity
The activities panel SHALL hold a Live broadcast activity for a participant holding `broadcastControl` in a room with live broadcast enabled, and for every participant while a broadcast is in progress, listing each destination with its status (connecting, live, stopping, stopped or failed, with the error). Without `broadcastControl` it SHALL offer no control and say who can control it.

#### Scenario: Speaker during a broadcast
- **GIVEN** a speaker without `broadcastControl` in a meeting streaming to a destination
- **WHEN** they open the activities panel
- **THEN** they see the destination as live and no control to stop or start it

#### Scenario: Status mark opens the activity
- **GIVEN** a meeting streaming to a destination
- **WHEN** a participant clicks the `LIVE` mark in the status rail
- **THEN** the activities panel opens on the Live broadcast activity

### Requirement: Going live from the activity
Before the meeting goes live, the activity SHALL list the room's destinations, all chosen by default, let the participant leave any out but never change them, show the upload the chosen ones need, and go live to the chosen ones. Going live SHALL be disabled, telling why, while nobody in the meeting publishes audio or video.

#### Scenario: One destination left out
- **GIVEN** a room with destinations A and B and a moderator in its meeting
- **WHEN** the moderator unticks B and goes live
- **THEN** the meeting streams to A only

#### Scenario: Nobody publishes
- **GIVEN** a meeting where nobody publishes audio or video
- **WHEN** a moderator opens the Live broadcast activity
- **THEN** going live is disabled and the activity asks to share audio or video first

### Requirement: Destinations added in the meeting
A participant holding `broadcastControl` and `broadcastAddDestinations` SHALL be able to add a destination by name and full URL for that meeting while fewer than five are chosen or streamed. Before going live it SHALL be listed and removable; while live, adding it SHALL stream to it at once, and a refusal SHALL keep its editor open with the server's message while the other broadcasts go on.

#### Scenario: Destination added while live
- **GIVEN** a meeting streaming to room destination A
- **WHEN** a moderator holding both permissions adds destination C in the activity
- **THEN** the meeting also streams to C, which the activity marks as a destination of this meeting

#### Scenario: Refused destination
- **WHEN** the server refuses a destination added while live
- **THEN** the editor stays open with the server's message and the meeting keeps streaming to its other destinations

#### Scenario: Without the permission to add
- **GIVEN** a participant holding `broadcastControl` but not `broadcastAddDestinations`
- **WHEN** they open the Live broadcast activity
- **THEN** no option to add a destination is offered

### Requirement: Controlling each destination while live
While the meeting is live, the activity SHALL let a participant holding `broadcastControl` stop each destination, start again a room destination that is not streamed to, retry a failed one and stop the whole broadcast. When every broadcast failed, it SHALL show the failure with a retry and a dismiss.

#### Scenario: Retry a failed destination
- **GIVEN** a meeting live to destination A whose broadcast to destination B failed
- **WHEN** a moderator retries B in the activity
- **THEN** a new broadcast to B starts while A stays live

#### Scenario: Stop the whole broadcast
- **WHEN** a moderator stops the broadcast from the activity
- **THEN** every running broadcast of the meeting ends

### Requirement: Live broadcast control in More options
The More options menu SHALL offer a participant holding `broadcastControl` in a room with live broadcast enabled to start the live broadcast, going live to every room destination not streamed to yet and opening the activity, or to stop it, ending every running broadcast. It SHALL be disabled while nobody publishes audio or video, while a start is waiting for the server and while the broadcast ends.

#### Scenario: Go live from the toolbar
- **GIVEN** a moderator in a meeting of a room with two destinations
- **WHEN** they choose Start live broadcast in More options
- **THEN** the meeting goes live to both destinations and the activities panel opens on the Live broadcast activity

#### Scenario: Live broadcast disabled in the room
- **GIVEN** a room with `broadcast.enabled` set to `false`
- **WHEN** a moderator opens More options in its meeting
- **THEN** no live broadcast item is offered

### Requirement: Live broadcast in the room wizard
The console room wizard SHALL offer a Live broadcast step with the switch, up to five default destinations to add, edit and remove, and the layout. A saved stream key SHALL never be shown, and an edited destination SHALL keep it while its URL is left as served. Finishing SHALL be blocked while live broadcast is allowed without a destination.

#### Scenario: Allowed without a destination
- **GIVEN** a user creating a room in the wizard
- **WHEN** they allow live broadcast and add no destination
- **THEN** the step asks for at least one destination and the finish button is disabled

#### Scenario: Destination renamed
- **GIVEN** a room with a saved destination
- **WHEN** its owner edits the room, renames the destination, leaves its URL as shown and saves
- **THEN** the destination keeps its stream key under the new name

### Requirement: Broadcast permissions in the Room Access step
The Room Access step of the wizard SHALL show the `broadcastControl` and `broadcastAddDestinations` switches of each role disabled while live broadcast is not allowed, keeping their values, and `broadcastAddDestinations` disabled for a role that does not hold `broadcastControl`, since it has no effect without it.

#### Scenario: Speaker given control
- **GIVEN** a wizard with live broadcast allowed and the speaker role denying `broadcastControl`
- **WHEN** the user grants `broadcastControl` to the speaker role
- **THEN** the speaker's `broadcastAddDestinations` switch becomes available

### Requirement: Rooms from before live broadcast
On upgrading to 3.10.0, every existing room SHALL get live broadcast disabled, with no destinations, layout `grid` and encoding `H264_720P_30`. Its roles and members SHALL hold neither broadcast permission (see `permissions`).

#### Scenario: Room from 3.9.0
- **GIVEN** a room created by 3.9.0
- **WHEN** the deployment is upgraded and a manager reads the room's config and roles
- **THEN** `broadcast.enabled` is `false` with no destinations, and both roles deny `broadcastControl` and `broadcastAddDestinations`
