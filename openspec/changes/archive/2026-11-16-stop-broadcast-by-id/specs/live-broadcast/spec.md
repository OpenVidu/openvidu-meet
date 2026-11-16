## MODIFIED Requirements

### Requirement: Broadcast lists in the responses

`broadcastStart` SHALL answer with a `broadcasts` list, one entry per broadcast started, at least one, and `broadcastStop` with the broadcast it stopped, each the same broadcast object `broadcastGet` returns and the broadcast webhooks carry. A broadcast SHALL carry what it streams to in `destination`, with the fields of a room config destination: the `id` of a room destination, absent for one given for that meeting only, its `name` and its redacted `url`.

#### Scenario: Two destinations started

- **GIVEN** a room with two destinations and a meeting in progress
- **WHEN** `broadcastStart` is called with only the room's `roomId`
- **THEN** the response body is a `broadcasts` list of two broadcasts, each with its own `broadcastId` and its destination in `destination`, carrying that destination's `id`, `name` and redacted `url`

#### Scenario: One broadcast stopped

- **GIVEN** a meeting streaming to destination A
- **WHEN** `broadcastStop` is called with the broadcast to A
- **THEN** the response body is that broadcast in its final state, with its destination in `destination`

### Requirement: Broadcasts need an egress service

`broadcastStart` and `broadcastStop` SHALL answer `503` with error `LiveKit Error` when no egress service of the deployment takes the request, starting or stopping nothing, and `bulkStopBroadcasts` SHALL report each broadcast it could not stop for that reason in `failed`. Broadcasts need the OpenVidu egress, which reports each stream with the tag the server gives its URL: against an egress that does not, `broadcastStart` SHALL answer `500` and withdraw what it added, so nothing streams.

#### Scenario: No egress service running

- **GIVEN** a deployment whose egress service is down
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `503` and no broadcast is in progress

#### Scenario: Egress without stream tags

- **GIVEN** a deployment whose egress service does not report stream tags
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `500`, no broadcast is in progress and nothing is streamed

### Requirement: Embedded broadcast commands

The embedded element SHALL run `broadcastStart(options?)`, the body of the REST operation of the same name without `roomId`, `broadcastStop({ broadcastId })` and `broadcastStopAll()`, for a local participant holding `broadcastControl` in a joined meeting, showing them in the activity as its own requests. `broadcastStart` without options SHALL start every room destination not streamed to yet. `broadcastStopAll` SHALL stop the broadcasts running, those of a start the participant asked for and the server has not answered yet included, and with nothing running or starting SHALL do nothing.

#### Scenario: Go live from the host

- **GIVEN** a joined moderator holding `broadcastControl` in a room with two destinations
- **WHEN** the host calls `broadcastStart()`
- **THEN** the meeting goes live to both destinations

#### Scenario: Start from the host shown in the activity

- **GIVEN** a moderator with the Live broadcast activity open in a meeting live to room destination A
- **WHEN** the host calls `broadcastStart({ destinationIds: ["B"] })`
- **THEN** the activity shows B as connecting until it goes live

#### Scenario: Destination for the meeting without its permission

- **GIVEN** a joined participant holding `broadcastControl` but not `broadcastEdit`
- **WHEN** the host calls `broadcastStart({ destinations: [{ name: "Own", url: "rtmp://media.example.com/live/key" }] })`
- **THEN** no broadcast starts and the browser console logs the server's refusal

#### Scenario: Participant without the permission

- **GIVEN** a joined speaker without `broadcastControl`
- **WHEN** the host calls `broadcastStopAll()`
- **THEN** nothing is stopped and the console warns that `broadcastControl` is missing

#### Scenario: Stop one destination from the host

- **GIVEN** a joined moderator holding `broadcastControl` in a meeting live to destinations A and B
- **WHEN** the host calls `broadcastStop({ broadcastId })` with the broadcast to A
- **THEN** the broadcast to A ends and the one to B goes on

#### Scenario: Stop everything right after a start

- **GIVEN** a joined moderator holding `broadcastControl` in a room with destination A
- **WHEN** the host calls `broadcastStart()` and then `broadcastStopAll()` before the start is answered
- **THEN** the broadcast to A ends once the start is answered

## ADDED Requirements

### Requirement: Stopping one broadcast

`DELETE /api/v1/broadcasts/{broadcastId}` (`broadcastStop`) SHALL accept an API key or a room member token holding `broadcastControl` in the broadcast's room, and stop at once the broadcast named in the path while the others of the meeting go on. It SHALL answer `200` with the broadcast in its final state: `complete`, with `endDate` and `duration`, or `aborted`, without dates, when no media had reached its destination.

#### Scenario: Stop one destination

- **GIVEN** a meeting streaming to destinations A and B
- **WHEN** `broadcastStop` is called with the broadcast to A
- **THEN** the REST API answers `200` with that broadcast `complete`, and the broadcast to B stays `active`

#### Scenario: Stop a broadcast still starting

- **GIVEN** a broadcast whose destination has not received media yet
- **WHEN** `broadcastStop` is called for it
- **THEN** it ends `aborted` without `startDate`, `endDate` nor `duration`

#### Scenario: Token without the permission

- **WHEN** `broadcastStop` is called with a room member token lacking `broadcastControl`
- **THEN** the REST API answers `403` and the broadcast goes on

### Requirement: A stop names a broadcast in progress

`broadcastStop` for a broadcast that is not in progress SHALL answer `404`, and for one already `ending` SHALL answer `409`, stopping nothing. A room member token of another room SHALL get `403` before any lookup, as for `broadcastGet`.

#### Scenario: Unknown identifier

- **GIVEN** a meeting streaming to destination A
- **WHEN** `broadcastStop` is called with an unknown `broadcastId`
- **THEN** the REST API answers `404` and the broadcast to A goes on

#### Scenario: Broadcast of another room

- **GIVEN** a token holding `broadcastControl` in room A and a broadcast in progress in room B
- **WHEN** `broadcastStop` is called with that token and the `broadcastId` of room B's broadcast
- **THEN** the REST API answers `403` and room B's broadcast goes on

#### Scenario: Broadcast already ending

- **GIVEN** a broadcast to destination A that a moderator just stopped and is still `ending`
- **WHEN** `broadcastStop` is called for it again
- **THEN** the REST API answers `409`

### Requirement: Stopping several broadcasts

`DELETE /api/v1/broadcasts?broadcastIds=` (`bulkStopBroadcasts`) SHALL take a comma-separated list of at most 100 distinct broadcast identifiers, accept an API key or a room member token, and stop each broadcast on its own as `broadcastStop` does. It SHALL answer `200` when every broadcast named stopped and `400` otherwise, listing the ones stopped in `deleted`. An empty list, or one longer than 100 identifiers, SHALL answer `422`.

#### Scenario: Stop two broadcasts

- **GIVEN** a meeting streaming to destinations A and B
- **WHEN** `bulkStopBroadcasts` is called with the broadcasts to A and B
- **THEN** the REST API answers `200` with both in `deleted` and an empty `failed`, and both broadcasts end

#### Scenario: No broadcast named

- **WHEN** `bulkStopBroadcasts` is called with an empty `broadcastIds`
- **THEN** the REST API answers `422`

### Requirement: Each broadcast of a bulk stop fails alone

`bulkStopBroadcasts` SHALL check `broadcastControl` in the room of each broadcast, and list in `failed`, with the reason, each one it could not stop because the caller lacks that permission, it is not in progress, it is already `ending` or LiveKit refused the stop, without undoing the others.

#### Scenario: One broadcast already over

- **GIVEN** a meeting streaming to destination B, whose broadcast to destination A already ended
- **WHEN** `bulkStopBroadcasts` is called with the broadcasts to A and B
- **THEN** the REST API answers `400` with B in `deleted` and A in `failed`, and the broadcast to B ends

#### Scenario: Token without the permission

- **GIVEN** a broadcast in progress in room A
- **WHEN** `bulkStopBroadcasts` is called for it with a room member token of room A lacking `broadcastControl`, or with a token of another room
- **THEN** the REST API answers `400` with the broadcast in `failed`, and the broadcast goes on

## REMOVED Requirements

### Requirement: Stopping broadcasts

**Reason**: `broadcastStop` names the broadcast in its path and stopping several becomes `bulkStopBroadcasts`, which names each one; no operation stops every broadcast of a room.
**Migration**: See "Stopping one broadcast" and "Stopping several broadcasts".

### Requirement: Stops are all or nothing

**Reason**: Each broadcast of a bulk stop stops or fails on its own, as in the other bulk operations.
**Migration**: See "A stop names a broadcast in progress" and "Each broadcast of a bulk stop fails alone".
