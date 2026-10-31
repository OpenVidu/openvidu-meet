# Recordings Specification

## Purpose

Recordings capture a room's meetings into a video file that Meet stores and serves afterwards.
Participants, room managers, administrators and integrators rely on them to start and stop
recordings, follow their progress, and then list, play, share, download and delete them.

Surfaces: REST API (`startRecording`, `stopRecording`, `getRecordings`, `getRecording`,
`deleteRecording`, `bulkDeleteRecordings`, `getRecordingMedia`, `downloadRecording`,
`downloadRecordings`, `getRecordingUrl`; `meet-ce/backend/openapi/recordings/`), webhooks
(`recordingStarted`, `recordingUpdated`, `recordingEnded`; `meet-ce/backend/openapi/webhooks/`),
embedded API (commands `recordingStart` and `recordingStop`, event `recordingStatusChanged`,
attributes `recording-url`, `show-only-recordings` and `show-recording`; TSDoc in
`meet-ce/typings/src/embedded/`), room config `recording.*` (`meet-ce/typings/src/database/room-config.ts`),
the meeting (toolbar, activities panel, status rail, notices), the room recordings page, the
recording view page and the console (Recordings page and recording detail). Documented in
openvidu.io `docs/meet/features/recordings/` and
`docs/meet/embedded/tutorials/advanced-features/recordings.md`.

## Requirements

### Requirement: Recording is enabled per room
The server SHALL start a recording in a room, on demand or automatically, only while the room's
`recording.enabled` config is `true`, and SHALL answer an on-demand start with `403` otherwise. How
the room config is created and updated belongs to `room-config`.

#### Scenario: Start refused in a room with recording disabled
- **GIVEN** a room with `recording.enabled` set to `false` and a meeting in progress
- **WHEN** a caller holding `recordingControl` calls `startRecording` for that room
- **THEN** the REST API answers `403`
- **AND** no recording is created

#### Scenario: Start accepted in a room with recording enabled
- **GIVEN** a room with `recording.enabled` set to `true` and a meeting in progress
- **WHEN** a caller holding `recordingControl` calls `startRecording` for that room
- **THEN** the REST API answers `201`

#### Scenario: Auto-start in a room with recording disabled
- **GIVEN** a room with `recording.enabled` set to `false` and `recording.autoStart` set to `when_first_participant_joins`
- **WHEN** the first participant joins its meeting
- **THEN** no recording starts

### Requirement: Recording and end-to-end encryption exclude each other
The server SHALL store `recording.enabled` as `false` whenever the room's `e2ee.enabled` is `true`,
both when the room is created and on every config update, so an encrypted room is never recorded.

#### Scenario: Room created with both features enabled
- **WHEN** a room is created with `recording.enabled` and `e2ee.enabled` both `true`
- **THEN** the stored room config has `recording.enabled` set to `false`

#### Scenario: Encryption enabled later on a recorded room
- **GIVEN** a room with `recording.enabled` set to `true`
- **WHEN** its config is updated with only `e2ee.enabled` set to `true`
- **THEN** the stored room config has `recording.enabled` set to `false`

### Requirement: Recording layout and encoding
Each recording SHALL be produced with the room's `recording.layout` (`grid`, `speaker` or
`single-speaker`) and `recording.encoding` (a preset name or a complete set of video and audio
options), `grid` and `H264_720P_30` when the room sets none. `startRecording` SHALL accept a
`config` whose `layout` and `encoding` replace the room's for that recording only. Every recording
SHALL report the layout and encoding it used.

#### Scenario: Room defaults apply
- **GIVEN** a room created without `recording.layout` nor `recording.encoding`
- **WHEN** a recording is started without `config`
- **THEN** the recording reports layout `grid` and encoding `H264_720P_30`

#### Scenario: Per-recording override
- **GIVEN** a room whose `recording.layout` is `grid`
- **WHEN** `startRecording` is called with `config.layout` set to `speaker`
- **THEN** that recording reports layout `speaker`
- **AND** the room's `recording.layout` is still `grid`

#### Scenario: Incomplete encoding options rejected
- **WHEN** `startRecording` is called with a `config.encoding` object that lacks the audio settings or any video field
- **THEN** the REST API answers `422` and starts nothing

### Requirement: Recording auto-start
While the room's `recording.autoStart` is set, the server SHALL start the room's recording by itself
as soon as the meeting holds one participant (`when_first_participant_joins`), two participants
(`when_second_participant_joins`) or one participant with the moderator role (`when_moderator_joins`),
re-evaluating on every join and every promotion to moderator. No participant's `recordingControl` is
involved. `null` or an absent value means recordings start only on demand.

#### Scenario: First participant joins
- **GIVEN** a room with `recording.autoStart` set to `when_first_participant_joins`
- **WHEN** the first participant joins its meeting
- **THEN** a recording of that meeting starts without any request

#### Scenario: Second participant mode waits for the second participant
- **GIVEN** a room with `recording.autoStart` set to `when_second_participant_joins`
- **WHEN** the first participant joins
- **THEN** no recording starts
- **AND** a recording starts when a second participant joins

#### Scenario: Moderator mode reached by a promotion
- **GIVEN** a room with `recording.autoStart` set to `when_moderator_joins` and a meeting holding only speakers
- **WHEN** one of the speakers is promoted to moderator
- **THEN** a recording of the meeting starts

#### Scenario: On-demand room never starts by itself
- **GIVEN** a room with `recording.autoStart` set to `null`
- **WHEN** participants join its meeting
- **THEN** no recording starts

### Requirement: Auto-start must be reachable
The server SHALL reject with `422`, on room creation and on config update, a room config whose
`recording.autoStart` needs more participants than its `maxParticipants` admits.

#### Scenario: Second-participant trigger in a one-participant room
- **WHEN** a room is created or updated with `maxParticipants` set to `1` and `recording.autoStart` set to `when_second_participant_joins`
- **THEN** the REST API answers `422`
- **AND** the room config is not stored

### Requirement: A deliberate stop disarms the auto-start until the meeting ends
A stop requested through `stopRecording` (which the meeting's stop control and the `recordingStop`
command also use) SHALL keep the room's auto-start from starting another recording for the rest of
that meeting, on every replica. A recording that ends any other way SHALL leave the auto-start armed,
and the next meeting in the room SHALL auto-start again.

#### Scenario: No restart after a deliberate stop
- **GIVEN** a meeting whose recording was auto-started and then stopped through `stopRecording`
- **WHEN** another participant joins the same meeting
- **THEN** no new recording starts

#### Scenario: Next meeting records again
- **GIVEN** a meeting whose auto-started recording was stopped through `stopRecording`
- **WHEN** that meeting ends and a new meeting starts in the room, reaching the threshold
- **THEN** a new recording starts by itself

#### Scenario: A recording ended by the system keeps the auto-start armed
- **GIVEN** a meeting whose auto-started recording ended without a `stopRecording` call
- **WHEN** another participant joins the meeting with the threshold still met
- **THEN** a new recording starts by itself

#### Scenario: Stop and join handled by different replicas
- **GIVEN** two Meet replicas serving the same deployment
- **WHEN** replica A handles the `stopRecording` call and replica B handles a later join to the same meeting
- **THEN** replica B starts no recording

### Requirement: On-demand start refused in a room that records automatically
`startRecording` SHALL answer `403` for a room whose `recording.autoStart` is set, so neither the
meeting nor the embedded API can start its recording by hand. Stopping the auto-started recording
SHALL stay allowed.

#### Scenario: Manual start in an auto-start room
- **GIVEN** a room with `recording.autoStart` set and a meeting in progress without a recording
- **WHEN** a caller holding `recordingControl` calls `startRecording` for that room
- **THEN** the REST API answers `403`

#### Scenario: Auto-started recording stopped by hand
- **GIVEN** a room with `recording.autoStart` set whose recording is active
- **WHEN** a caller holding `recordingControl` calls `stopRecording` for it
- **THEN** the REST API answers `202`

### Requirement: Starting a recording through the REST API
`startRecording` SHALL accept only an API key or a room member token holding `recordingControl` in
the target room, and SHALL answer `201` with the recording in the `starting` status and a `Location`
header pointing at it, without waiting for the recording to capture media. It SHALL answer `404` for
an unknown room, `409` when nobody is connected to the room or a recording is `starting`, `active` or
`ending` in it, and `503` when no egress service takes the recording.

#### Scenario: Start with an API key
- **GIVEN** a room with recording enabled and a meeting in progress
- **WHEN** `startRecording` is called with an API key
- **THEN** the REST API answers `201` with a recording in the `starting` status and a `Location` header

#### Scenario: User access token not accepted
- **WHEN** `startRecording` is called with only a user access token, even an `admin` one
- **THEN** the REST API answers `401`

#### Scenario: Room member token without the permission
- **WHEN** `startRecording` is called with a room member token lacking `recordingControl`, or issued for another room
- **THEN** the REST API answers `403`

#### Scenario: Unknown room
- **WHEN** `startRecording` is called for a room that does not exist
- **THEN** the REST API answers `404`

#### Scenario: No meeting in progress
- **GIVEN** a room with recording enabled and nobody connected
- **WHEN** `startRecording` is called for it
- **THEN** the REST API answers `409`

#### Scenario: Room already being recorded
- **GIVEN** a room whose recording is active
- **WHEN** `startRecording` is called for it again
- **THEN** the REST API answers `409`

#### Scenario: Media server does not accept the recording
- **GIVEN** a room with recording enabled, a meeting in progress and the deployment's egress service down
- **WHEN** `startRecording` is called for it
- **THEN** the REST API answers `503` with error `LiveKit Error`
- **AND** no recording is created and the room has no recording in progress
- **AND** a later `startRecording`, once the egress service is back, answers `201`

### Requirement: One recording in progress per room across replicas
The server SHALL let a room have at most one recording in progress, whichever replica receives each
start, and SHALL make the room recordable again as soon as that recording has ended or the media
server refused to start it.

#### Scenario: Concurrent starts on two replicas
- **GIVEN** two Meet replicas and a room with a meeting in progress and no recording
- **WHEN** replica A and replica B each receive `startRecording` for that room at the same time
- **THEN** one call answers `201` and the other answers `409`
- **AND** the room has exactly one recording

#### Scenario: Start refused by the media server
- **GIVEN** a room with a meeting in progress whose recording start the media server refuses
- **WHEN** `startRecording` is called again once the media server accepts recordings
- **THEN** the REST API answers `201`

### Requirement: A recording waits for the first published track
The server SHALL keep a started recording in the `starting` status, with no time limit, for as long
as no participant publishes audio or video, and the recording SHALL become `active` as soon as one
does.

#### Scenario: Nobody publishes yet
- **GIVEN** a meeting whose participants publish no audio and no video
- **WHEN** a recording is started
- **THEN** the recording stays `starting` and has no `startDate`
- **AND** it becomes `active` once a participant publishes a track

### Requirement: Stopping a recording
`stopRecording` SHALL accept only an API key or a room member token holding `recordingControl` in the
recording's room, and SHALL answer `202` with the recording for a recording that is `starting` or
`active`, its final status being reported afterwards; `409` for one already `ending` or ended and
`404` for an unknown one. A recording stopped while `starting` SHALL end `aborted`, without a file.

#### Scenario: Stop an active recording
- **GIVEN** an active recording
- **WHEN** a caller holding `recordingControl` calls `stopRecording` for it
- **THEN** the REST API answers `202`
- **AND** the recording later reaches `complete` with its file available

#### Scenario: Stop a recording still waiting for its first track
- **GIVEN** a recording in the `starting` status
- **WHEN** `stopRecording` is called for it
- **THEN** the REST API answers `202`
- **AND** the recording ends `aborted` without a file

#### Scenario: Caller without the permission
- **WHEN** `stopRecording` is called with a room member token lacking `recordingControl`, or with only a user access token
- **THEN** the REST API answers `403`, or `401` for the user access token

#### Scenario: Unknown recording
- **WHEN** `stopRecording` is called with a well-formed id that matches no recording
- **THEN** the REST API answers `404`

#### Scenario: Recording already stopped
- **GIVEN** a recording that has just been stopped
- **WHEN** `stopRecording` is called for it again
- **THEN** the REST API answers `409`

### Requirement: Stops are serialized per room across replicas
The server SHALL run one stop at a time per room, whichever replica receives it, and SHALL answer
`409` to a stop arriving while another one for the same room is in flight.

#### Scenario: Two stops on two replicas
- **GIVEN** two Meet replicas and an active recording in an auto-start room
- **WHEN** replica A and replica B each receive `stopRecording` for it at the same time
- **THEN** one call answers `202` and the other answers `409`
- **AND** the auto-start stays disarmed for the rest of the meeting

### Requirement: A recording ends with its meeting
When a meeting ends, the server SHALL end the recording in progress in it, reporting its final status
like any other end, and the room SHALL be recordable again in its next meeting.

#### Scenario: Meeting ended while recording
- **GIVEN** a meeting with an active recording
- **WHEN** the meeting ends
- **THEN** the recording reaches a final status and `recordingEnded` is sent
- **AND** a recording can be started in the room's next meeting

### Requirement: Recording statuses
Each recording SHALL move only forward through `starting`, `active` and `ending` to one final status:
`complete` (file available), `failed`, `aborted` or `limit_reached`. Its `startDate` SHALL be the
moment it began capturing media, absent while `starting` and on a recording that never captured
anything.

#### Scenario: Normal lifecycle
- **WHEN** a recording is started, captures media and is stopped
- **THEN** its status goes from `starting` to `active`, then `ending`, then `complete`
- **AND** its `startDate` is set from the moment it became `active`

#### Scenario: Recording that never captured media
- **WHEN** a recording is stopped while still `starting`
- **THEN** its final status is `aborted` and it has no `startDate`

### Requirement: Recording webhooks
The server SHALL send `recordingStarted` when the media server reports a new recording (status
`starting` or `active`), `recordingUpdated` on each later in-progress change (`active` or `ending`)
and `recordingEnded` with the final status, each carrying the recording. Delivery rules belong to
`webhooks`.

#### Scenario: Started, updated and ended
- **GIVEN** a registered webhook endpoint subscribed to recording events
- **WHEN** a recording is started, becomes active and is stopped
- **THEN** the endpoint receives `recordingStarted`, `recordingUpdated` and `recordingEnded` for the same `recordingId`
- **AND** `recordingEnded` carries a final status

### Requirement: Recording identifiers
Every recording SHALL be identified by a `recordingId` made of three parts joined by `--`: the room
id, an identifier starting with `EG_` and a unique suffix (for example `room-123--EG_XYZ--XX445`), and
every operation that takes recording ids SHALL reject a malformed one with `422`.

#### Scenario: Malformed recording id
- **WHEN** an authenticated caller sends `getRecording`, `deleteRecording`, `stopRecording` or `bulkDeleteRecordings` an id that does not follow the format
- **THEN** the REST API answers `422`

#### Scenario: Well-formed unknown recording id
- **WHEN** `getRecording` is called with an API key and a well-formed id that matches no recording
- **THEN** the REST API answers `404`

### Requirement: Recording list scope
`getRecordings` SHALL return every recording to an API key or an `admin` user; to a room member token
holding `recordingList`, only those of its room whatever the `roomId` filter (`403` without the
permission); and to `room_manager` and `room_member` users, only those of rooms they own, rooms where
their membership holds `recordingList`, and rooms open to registered users whose speaker role holds
`recordingList`, leaving the rest out. A `recordingSecret` SHALL NOT authenticate the list.

#### Scenario: Room member token scoped to its room
- **GIVEN** recordings in rooms A and B and a room member token of room A holding `recordingList`
- **WHEN** `getRecordings` is called with that token and `roomId` set to B
- **THEN** the REST API answers `200` with the recordings of room A only

#### Scenario: Room member token without the permission
- **WHEN** `getRecordings` is called with a room member token lacking `recordingList`
- **THEN** the REST API answers `403`

#### Scenario: Recording secret alone
- **WHEN** `getRecordings` is called with only a `recordingSecret` query parameter
- **THEN** the REST API answers `401`

#### Scenario: Member with the permission
- **GIVEN** a `room_member` user who is a member of room A with `recordingList`, and recordings in room A and in a room B the user has no access to
- **WHEN** the user calls `getRecordings`
- **THEN** the REST API answers `200` with the recordings of room A only

#### Scenario: User with no access to any recorded room
- **GIVEN** recordings only in rooms a `room_manager` user neither owns, nor is a member of, nor may enter as a registered user
- **WHEN** the user calls `getRecordings`
- **THEN** the REST API answers `200` with an empty list

#### Scenario: Unauthenticated caller
- **WHEN** `getRecordings` is called without credentials
- **THEN** the REST API answers `401`

### Requirement: Recording list filtering, sorting and pagination
`getRecordings` SHALL filter by `roomId` (which wins over `roomName`), by `roomName` (exact by
default, or prefix, partial or regex match, optionally case-insensitive) and by `status`; SHALL sort
by `startDate` (default, newest first), `roomName`, `duration` or `size`; and SHALL paginate with
`maxItems` (default `10`, values above `100` served as `100`) and `nextPageToken`.

#### Scenario: Default order
- **WHEN** `getRecordings` is called without sort parameters
- **THEN** the recordings come newest `startDate` first, at most 10 per page

#### Scenario: Oversized page
- **WHEN** `getRecordings` is called with `maxItems` set to `500`
- **THEN** the page holds at most 100 recordings and reports `maxItems` as `100`

#### Scenario: Invalid parameters
- **WHEN** `getRecordings` is called with `maxItems` set to `0`, an unknown `status`, or an invalid regular expression in regex mode
- **THEN** the REST API answers `422`

#### Scenario: Invalid page token
- **WHEN** `getRecordings` is called with a `nextPageToken` the server did not issue
- **THEN** the REST API answers `400`

### Requirement: Recording response field selection
`getRecordings`, `getRecording`, `startRecording` and `stopRecording` SHALL return only the recording
fields named in the `fields` query parameter and the `X-Fields` header together, ignoring unknown
names, and every field when none is named.

#### Scenario: Header and query parameter combined
- **WHEN** `getRecordings` is called with `fields=recordingId` and the header `X-Fields: status`
- **THEN** each recording in the response carries only `recordingId` and `status`

### Requirement: Reading a recording
`getRecording` SHALL return the recording to a caller holding `recordingPlay` in the recording's room
or presenting a valid `recordingSecret` (see "Access with a recording secret"), and SHALL answer
`403` to any other authenticated caller.

#### Scenario: Listing without playing
- **GIVEN** a room member token holding `recordingList` but not `recordingPlay`
- **WHEN** `getRecording` is called with it for a recording of its room
- **THEN** the REST API answers `403`

#### Scenario: Owner of the room
- **GIVEN** a `room_manager` user who owns the recording's room
- **WHEN** the user calls `getRecording`
- **THEN** the REST API answers `200`

### Requirement: Playing a recording's media
`getRecordingMedia` SHALL stream a `complete` recording as `video/mp4` to a caller holding
`recordingPlay` or presenting a valid `recordingSecret`, SHALL answer `409` for a recording that is
not `complete`, and SHALL serve a single `bytes=start-end` or `bytes=start-` range as `206` with its
`Content-Range`. Credentials MAY travel as query parameters so a video element can play it (see
`authentication`).

#### Scenario: Full media
- **WHEN** `getRecordingMedia` is called for a complete recording without a `Range` header
- **THEN** the REST API answers `200` with the whole file as `video/mp4`

#### Scenario: Byte range
- **WHEN** `getRecordingMedia` is called with `Range: bytes=0-1023`
- **THEN** the REST API answers `206` with those bytes and a `Content-Range` header

#### Scenario: Range out of the file
- **WHEN** the range starts at or beyond the file size
- **THEN** the REST API answers `416`

#### Scenario: Unsupported range form
- **WHEN** the `Range` header is a suffix range, a list of ranges or uses a unit other than `bytes`
- **THEN** the REST API answers `422`

#### Scenario: Recording in progress
- **WHEN** `getRecordingMedia` is called for an active recording
- **THEN** the REST API answers `409`

### Requirement: Downloading a recording
`downloadRecording` SHALL serve the same media as `getRecordingMedia`, as an attachment named after
the recording's filename (or `{recordingId}.mp4`), gated by `recordingDownload` instead of
`recordingPlay`, or by a valid `recordingSecret`.

#### Scenario: Play granted, download denied
- **GIVEN** a room member token holding `recordingPlay` but not `recordingDownload`
- **WHEN** it calls `getRecordingMedia` and then `downloadRecording` for a recording of its room
- **THEN** the first call answers `200` and the second answers `403`

#### Scenario: Download granted, play denied
- **GIVEN** a room member token holding `recordingDownload` but not `recordingPlay`
- **WHEN** it calls `downloadRecording`
- **THEN** the REST API answers `200` with a `Content-Disposition: attachment` header

### Requirement: Downloading several recordings as a ZIP
`downloadRecordings` SHALL accept up to 100 distinct `recordingIds` and answer `422` to more, SHALL
answer with a `recordings.zip` attachment holding the requested recordings the caller may download
(`recordingDownload`, checked per recording) and that are `complete`, leaving the others out, and
SHALL answer `400` when the caller may download none of them. The app SHALL NOT offer the ZIP
download for a selection of more than 100 recordings.

#### Scenario: Mixed rooms with a room member token
- **GIVEN** a room member token of room A holding `recordingDownload`
- **WHEN** it calls `downloadRecordings` for one recording of room A and one of room B
- **THEN** the ZIP holds only the recording of room A

#### Scenario: Nothing downloadable
- **WHEN** `downloadRecordings` is called with ids of recordings the caller may not download
- **THEN** the REST API answers `400`

#### Scenario: Too many ids
- **WHEN** `downloadRecordings` is called with 101 distinct recording ids
- **THEN** the REST API answers `422` and builds no ZIP

#### Scenario: Large selection in the app
- **GIVEN** a user who selected 101 complete recordings in a recordings list of the app
- **WHEN** the user looks at the bulk actions
- **THEN** the ZIP download is disabled with an explanation of the 100-recording limit

### Requirement: Deleting a recording
`deleteRecording` SHALL require `recordingDelete` in the recording's room (a `recordingSecret` grants
nothing here), SHALL delete a recording whose status is final together with its file, and SHALL
answer `409` while the recording is `starting`, `active` or `ending` and `404` for an unknown one.

#### Scenario: Delete a finished recording
- **GIVEN** a complete recording and a caller holding `recordingDelete`
- **WHEN** the caller calls `deleteRecording`
- **THEN** the REST API answers `200`
- **AND** the recording is no longer listed and its media answers `404`

#### Scenario: Delete a recording in progress
- **WHEN** `deleteRecording` is called for an active recording
- **THEN** the REST API answers `409`

#### Scenario: Caller without the permission
- **WHEN** `deleteRecording` is called with credentials lacking `recordingDelete`, or with only a `recordingSecret`
- **THEN** the REST API answers `403`, or `401` for the secret alone

### Requirement: Deleting recordings in bulk
`bulkDeleteRecordings` SHALL accept up to 100 distinct `recordingIds` and answer `422` to more,
SHALL delete every requested recording the caller may delete (`recordingDelete`, checked per
recording) whose status is final, SHALL answer `200` when all of them were deleted, and SHALL
otherwise answer `400` listing the deleted ids and each failed id with its reason, keeping the
deletions it made. The app SHALL NOT offer bulk delete for a selection of more than 100.

#### Scenario: All deleted
- **WHEN** `bulkDeleteRecordings` is called with ids of finished recordings the caller may delete
- **THEN** the REST API answers `200` and every one of them is deleted

#### Scenario: Partial result
- **WHEN** `bulkDeleteRecordings` is called with one finished recording, one active recording and one unknown id
- **THEN** the REST API answers `400` with the finished one in `deleted` and the other two in `failed`
- **AND** the finished recording is deleted

#### Scenario: Too many ids
- **WHEN** `bulkDeleteRecordings` is called with 101 distinct recording ids
- **THEN** the REST API answers `422` and deletes nothing

#### Scenario: Repeated ids
- **WHEN** `bulkDeleteRecordings` is called with the same finished recording id twice
- **THEN** the REST API answers `200` with that recording once in `deleted`

#### Scenario: Large selection in the app
- **GIVEN** a user who selected 101 finished recordings they may delete in a recordings list of the app
- **WHEN** the user looks at the bulk actions
- **THEN** the bulk delete is disabled with an explanation of the 100-recording limit

### Requirement: Shareable recording links
`getRecordingUrl` SHALL require `recordingPlay` and return a link to the recording view page holding
one of the recording's two secrets, both created with the recording and never changed: the public
one by default, refused with `403` while the room's `access.anonymous.recording.enabled` is `false`,
or the private one with `privateAccess=true`, always available.

#### Scenario: Public link
- **GIVEN** a room with anonymous recording access enabled
- **WHEN** `getRecordingUrl` is called for one of its recordings
- **THEN** the REST API answers `200` with a `/recording/{recordingId}?recordingSecret=...` link

#### Scenario: Public link with anonymous recording access disabled
- **GIVEN** a room with `access.anonymous.recording.enabled` set to `false`
- **WHEN** `getRecordingUrl` is called without `privateAccess`
- **THEN** the REST API answers `403`
- **AND** the same call with `privateAccess=true` answers `200`

### Requirement: Access with a recording secret
For `getRecording`, `getRecordingMedia` and `downloadRecording`, a public secret SHALL grant access on
its own, without any credential, while the room's anonymous recording access is enabled, and `403`
while it is disabled. A private secret SHALL waive the recording permission for a caller authenticated
by any credential and answer `401` without one. An unrecognised secret SHALL answer `400` whatever
credential comes with it.

#### Scenario: Public secret without credentials
- **WHEN** `getRecordingMedia` is called with the public secret and no credential
- **THEN** the REST API answers `200`

#### Scenario: Anonymous recording access disabled after sharing
- **GIVEN** a public link issued while anonymous recording access was enabled
- **WHEN** the room's `access.anonymous.recording.enabled` becomes `false` and the link is used, with or without credentials
- **THEN** the REST API answers `403`
- **AND** the link works again once anonymous recording access is enabled again

#### Scenario: Private secret
- **GIVEN** a registered user with no access to the recording's room
- **WHEN** the user calls `getRecording` with the private secret
- **THEN** the REST API answers `200`
- **AND** the same call without any credential answers `401`

#### Scenario: Unrecognised secret
- **WHEN** `getRecording` is called with a `recordingSecret` that is not one of the recording's secrets, even with an API key
- **THEN** the REST API answers `400`

### Requirement: Recordings outlive their meeting
The server SHALL keep each recording and its file in the deployment's object storage (see
`deployment`) after its meeting ends, until the recording is deleted through `deleteRecording`,
`bulkDeleteRecordings` or the deletion of its room under the policies of `rooms`.

#### Scenario: Recording available after the meeting
- **GIVEN** a meeting that produced a complete recording
- **WHEN** the meeting ends and the room is closed
- **THEN** the recording is still listed and its media is still served

### Requirement: Clean-up of stale recordings
Once per cluster every 14 minutes, the server SHALL end every recording still `starting`, `active`
or `ending` whose recording process is no longer in progress in the media server, with the final
status the media server reports or `aborted` when it no longer knows the process, reporting it like
any other end. It SHALL stop a recording whose process has not reported for 5 minutes while its room
is gone or has nobody connected, and leave alone one whose room has participants connected.

#### Scenario: Recording process lost
- **GIVEN** a recording stored as `active` whose process the media server no longer knows
- **WHEN** the clean-up runs
- **THEN** the recording is marked `aborted`

#### Scenario: Lost recording reported
- **GIVEN** a registered webhook endpoint subscribed to recording events, and a meeting with participants whose recording is stored as `active` while the media server no longer knows its process
- **WHEN** the clean-up runs
- **THEN** the endpoint receives `recordingEnded` with status `aborted`
- **AND** the participants no longer see the recording mark, and an embedded host receives `recordingStatusChanged` with `aborted`

#### Scenario: Recording waiting in an occupied room
- **GIVEN** a recording still `starting` in a meeting whose participants publish nothing
- **WHEN** the clean-up runs
- **THEN** the recording stays `starting`

#### Scenario: Two replicas
- **GIVEN** two Meet replicas sharing the deployment
- **WHEN** the clean-up time comes
- **THEN** only one replica runs it

#### Scenario: Clean-up and end notification on two replicas
- **GIVEN** two Meet replicas and a recording whose process has just ended
- **WHEN** replica A runs the clean-up while replica B processes the media server's end notification for that recording
- **THEN** the recording gets one final status and `recordingEnded` is sent once

### Requirement: Clean-up of rooms left unable to record
Once per cluster every 15 minutes, the server SHALL make a room recordable again when the media
server has no recording in progress for it but the room is still held as being recorded, for
example after a replica crashed before processing a recording's end. A hold younger than 30 seconds
or a recording still in progress, even one waiting for its first track, SHALL keep the room held.

#### Scenario: Room freed after a lost recording end
- **GIVEN** a room held as being recorded for more than 30 seconds while the media server has no recording in progress for it
- **WHEN** the clean-up runs
- **THEN** `startRecording` for that room answers `201` again during its next meeting

#### Scenario: Two replicas
- **GIVEN** two Meet replicas sharing the deployment
- **WHEN** the clean-up time comes
- **THEN** only one replica runs it

### Requirement: Recording controls in the meeting
The meeting SHALL offer the start and stop recording control, in the More options menu and in the
activities panel, only to a participant holding `recordingControl` in a room with
`recording.enabled`.

#### Scenario: Recording disabled
- **GIVEN** a room with `recording.enabled` set to `false`
- **WHEN** a moderator joins its meeting
- **THEN** the meeting shows no recording control

#### Scenario: Participant without the permission
- **GIVEN** a room with recording enabled
- **WHEN** a participant without `recordingControl` joins its meeting
- **THEN** the meeting shows that participant no recording control

### Requirement: Availability of the recording controls
The meeting SHALL disable starting a recording, telling why, while nobody in the meeting publishes
audio or video and in a room whose `recording.autoStart` is set. It SHALL offer stopping while the
recording is `starting` or `active`, disable the control while the recording is ending, and show a
recording that ended `failed` or `limit_reached` in the activities panel with a retry.

#### Scenario: Auto-start room
- **GIVEN** a room with `recording.autoStart` set and no recording in progress
- **WHEN** a participant holding `recordingControl` opens the recording control
- **THEN** starting is disabled with an explanation that the room records on its own

#### Scenario: Stop while waiting for media
- **GIVEN** a recording `starting` because nobody publishes
- **WHEN** a participant holding `recordingControl` stops it from the activities panel
- **THEN** the recording ends `aborted` and the panel offers to start again

#### Scenario: Failed recording
- **GIVEN** a participant holding `recordingControl` in a meeting whose recording ended `failed`
- **WHEN** the participant opens the activities panel
- **THEN** the panel shows the failure and offers to retry

### Requirement: Recording status shown to every participant
The meeting SHALL show every participant the recording mark (REC) in the status rail while a recording is
`starting` or `active`, with the time elapsed since it began capturing media; a notice when it starts
capturing and when it stops; and a notice that stays until dismissed while a recording waits for
someone to publish. The status SHALL start over with each meeting entry.

#### Scenario: Participant joining a recorded meeting
- **GIVEN** a meeting with an active recording
- **WHEN** a participant joins
- **THEN** the participant sees the recording mark with the elapsed time and the notice that the meeting is being recorded

#### Scenario: Waiting for media
- **GIVEN** a meeting where nobody publishes audio or video
- **WHEN** a recording is started
- **THEN** every participant sees a notice that the recording waits for someone to publish, which stays until dismissed, until the recording starts or until it ends

#### Scenario: Next meeting with the same embedded element
- **GIVEN** an embedded element whose participant left a meeting while it was being recorded
- **WHEN** the same element joins a meeting that is not being recorded
- **THEN** no recording mark is shown

### Requirement: Room recordings from the meeting and the join screen
The meeting and the join screen SHALL offer the room's recordings to a participant holding
`recordingList` once the room has at least one recording, a recording completed during the meeting
included. From the meeting they SHALL open in a new browser tab.

#### Scenario: Room with recordings
- **GIVEN** a room with a complete recording
- **WHEN** a participant holding `recordingList` joins its meeting and chooses View recordings
- **THEN** the room recordings page opens in a new browser tab

#### Scenario: Participant without the permission
- **WHEN** a participant without `recordingList` joins a room with recordings
- **THEN** neither the join screen nor the meeting offers the recordings

### Requirement: Room recordings page
The page `/room/{roomId}/recordings` SHALL list the room's recordings to a visitor whose access to the
room (an access link secret, a room member or a registered user) holds `recordingList`, enabling play
and share only with `recordingPlay`, download only with `recordingDownload` and delete only with
`recordingDelete`. Without `recordingList` it SHALL show an error page. The room's anonymous
recording link (see `room-access`) grants list, play and download.

#### Scenario: Anonymous recording link
- **GIVEN** a room with recordings and anonymous recording access enabled
- **WHEN** a visitor opens the room's anonymous recording link
- **THEN** the page lists the room's recordings with play and download but no delete

#### Scenario: Access without the permission
- **WHEN** a visitor whose access to the room lacks `recordingList` opens the page
- **THEN** an error page is shown instead of the list

#### Scenario: Listing without playing
- **GIVEN** a room member whose permissions hold `recordingList` but not `recordingPlay`
- **WHEN** the member opens the room recordings page
- **THEN** the page lists the room's recordings with play and share disabled, and their tooltip names `recordingPlay`

### Requirement: Recording view page
The page `/recording/{recordingId}` SHALL play a `complete` recording, or show its status otherwise,
to a visitor holding `recordingPlay` in its room or bringing a valid `recordingSecret`. It SHALL offer
download with `recordingDownload` or a secret, and delete with `recordingDelete`. A visitor with a
private link and no session SHALL be sent to log in and back.

#### Scenario: Public link
- **WHEN** an anonymous visitor opens a public recording link
- **THEN** the page plays the recording and offers to download it

#### Scenario: Private link without a session
- **WHEN** a visitor without a session opens a private recording link
- **THEN** the visitor is sent to the login page and returns to the recording after logging in

#### Scenario: Unknown secret
- **WHEN** a visitor opens a recording link whose secret is not recognised
- **THEN** an error page is shown

### Requirement: Sharing a recording from the app
The share dialog SHALL let a visitor holding `recordingPlay` create a link either for anyone, offered
only while the room's anonymous recording access is enabled, or for OpenVidu Meet users only, and
copy it. A visitor who reached the recording through a link without holding `recordingPlay` SHALL be
offered that same link.

#### Scenario: Anonymous sharing disabled
- **GIVEN** a room with `access.anonymous.recording.enabled` set to `false`
- **WHEN** a member holding `recordingPlay` opens the share dialog for one of its recordings
- **THEN** only the OpenVidu Meet users option is available

### Requirement: Console recordings page
The console's Recordings page, available to `admin`, `room_manager` and `room_member` users, SHALL
list the recordings `getRecordings` returns to the user, searchable by room name with the same match
modes, filterable by status and sortable. Like a room's Recordings tab, it SHALL enable play and share
(`recordingPlay`) and offer download and ZIP download (`recordingDownload`) and delete and bulk delete
(`recordingDelete`) only for recordings whose room grants the user that permission.

#### Scenario: Admin
- **WHEN** an `admin` user opens the Recordings page
- **THEN** every recording is listed, with download offered for every complete one and delete for every finished one

#### Scenario: Member without delete permission
- **GIVEN** a `room_member` user holding `recordingList` but not `recordingDelete` in room A
- **WHEN** the user opens the Recordings page
- **THEN** the recordings of room A are listed without a delete action

#### Scenario: Member without play permission
- **GIVEN** a `room_member` user holding `recordingList` but not `recordingPlay` in room A
- **WHEN** the user opens the Recordings page, or the Recordings tab of room A's detail page
- **THEN** the recordings of room A are listed with play and share disabled, and their tooltip names `recordingPlay`

### Requirement: Console recording detail page
Opening a recording from the console list SHALL show its details (status, dates, duration, size,
filename, layout, encoding and any error) and, when it is `complete`, a player, with download, share
and delete offered by permission. A recording the user may not read SHALL take the user back to the
list.

#### Scenario: Recording the user may not read
- **WHEN** a user opens the console detail page of a recording whose room grants them no `recordingPlay`
- **THEN** the console returns to the Recordings page

### Requirement: Embedded recording commands
The embedded element SHALL run `recordingStart()` and `recordingStop()` only for a local participant
holding `recordingControl` in a joined meeting, ignoring them otherwise. `recordingStop()` SHALL stop
the recording the meeting knows, waiting first for a `recordingStart()` still in flight, and do
nothing when there is none. A start the server refuses SHALL produce no `recordingStatusChanged`.

#### Scenario: Start and stop
- **GIVEN** a joined moderator holding `recordingControl`
- **WHEN** the host calls `recordingStart()` and later `recordingStop()`
- **THEN** a recording starts and ends, and each status reaches the host through `recordingStatusChanged`

#### Scenario: Stop right after start
- **WHEN** the host calls `recordingStop()` immediately after `recordingStart()`
- **THEN** the recording that start created is stopped

#### Scenario: Participant without the permission
- **GIVEN** a joined speaker without `recordingControl`
- **WHEN** the host calls `recordingStart()`
- **THEN** no recording starts and no `recordingStatusChanged` is dispatched

### Requirement: recordingStatusChanged event
The embedded element SHALL dispatch `recordingStatusChanged` with `{ recordingId, status }` to the
host of every participant whenever a recording of the meeting changes status, whoever started or
stopped it, each status at most once and never backwards. A participant joining while a recording
is in progress SHALL receive its current status right after `meetingJoined`.

#### Scenario: Recording started by another participant
- **GIVEN** an embedded speaker in a meeting
- **WHEN** a moderator starts and then stops a recording
- **THEN** the speaker's host receives `recordingStatusChanged` with `active` and later `complete` for the same `recordingId`

#### Scenario: Joining while recording
- **GIVEN** a meeting with an active recording
- **WHEN** an embedded participant joins
- **THEN** the host receives `meetingJoined` followed by one `recordingStatusChanged` with `active`

### Requirement: Embedded attributes for recordings
The embedded element SHALL show the recording view instead of the meeting when given `recording-url`
(a link from `getRecordingUrl`) or `show-recording` with a recording id next to `room-url`, and the
room recordings page when given `show-only-recordings` read as `true` (boolean rule in
`embedded-api`) next to `room-url`. A room URL in an iframe or a direct link SHALL do the same with
the query parameters `show-recording` and `show-only-recordings`.

#### Scenario: recording-url
- **WHEN** a host embeds the element with `recording-url` set to a public recording link
- **THEN** the element plays that recording without joining any meeting

#### Scenario: show-only-recordings
- **WHEN** a host embeds the element with `room-url` and the bare attribute `show-only-recordings`
- **THEN** the element shows the room recordings page

#### Scenario: show-only-recordings set to false
- **WHEN** the attribute `show-only-recordings` is set to `"false"`
- **THEN** the element shows the meeting

#### Scenario: show-only-recordings as a query parameter
- **WHEN** a room URL is opened in an iframe with the query parameter `show-only-recordings` and no value, or with the value `1`
- **THEN** the room recordings page is shown instead of the meeting

#### Scenario: show-recording
- **WHEN** a host embeds the element with `room-url` and `show-recording` set to a recording id of that room
- **THEN** the element shows that recording, using the access of the room URL

### Requirement: A lost recording never blocks the room
When the egress service recording a meeting stops responding, the server SHALL end the recording `failed`, with the error `The egress service stopped responding`, send its `recordingEnded` webhook and make the room recordable again, instead of keeping the recording in progress.

#### Scenario: Egress service killed while recording
- **GIVEN** a meeting with an active recording
- **WHEN** the egress service running the recording dies
- **THEN** the recording ends `failed` and `recordingEnded` is sent
- **AND** `stopRecording` for it answers `409`
- **AND** `startRecording` for the room answers `201` once an egress service is available

#### Scenario: Next meeting of the room
- **GIVEN** a room whose recording was lost that way
- **WHEN** a new meeting starts in the room
- **THEN** `meetingGet` reports no recording in progress
