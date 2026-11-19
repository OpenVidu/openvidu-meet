## MODIFIED Requirements

### Requirement: Recording is enabled per room

The server SHALL start a recording in a room, on demand or automatically, only while the room's
`recording.enabled` config is `true`, and SHALL answer an on-demand start with `403` otherwise. How
the room config is created and updated belongs to `room-config`.

#### Scenario: Start refused in a room with recording disabled

- **GIVEN** a room with `recording.enabled` set to `false` and a meeting in progress
- **WHEN** a caller holding `recordingControl` calls `recordingStart` for that room
- **THEN** the REST API answers `403`
- **AND** no recording is created

#### Scenario: Start accepted in a room with recording enabled

- **GIVEN** a room with `recording.enabled` set to `true` and a meeting in progress
- **WHEN** a caller holding `recordingControl` calls `recordingStart` for that room
- **THEN** the REST API answers `201`

#### Scenario: Auto-start in a room with recording disabled

- **GIVEN** a room with `recording.enabled` set to `false` and `recording.autoStart` set to `when_first_participant_joins`
- **WHEN** the first participant joins its meeting
- **THEN** no recording starts

### Requirement: Recording layout and encoding

Each recording SHALL be produced with the room's `recording.layout` (`grid`, `speaker` or
`single-speaker`) and `recording.encoding` (a preset name or a complete set of video and audio
options), `grid` and `H264_720P_30` when the room sets none. `recordingStart` SHALL accept a
`config` whose `layout` and `encoding` replace the room's for that recording only. Every recording
SHALL report the layout and encoding it used.

#### Scenario: Room defaults apply

- **GIVEN** a room created without `recording.layout` nor `recording.encoding`
- **WHEN** a recording is started without `config`
- **THEN** the recording reports layout `grid` and encoding `H264_720P_30`

#### Scenario: Per-recording override

- **GIVEN** a room whose `recording.layout` is `grid`
- **WHEN** `recordingStart` is called with `config.layout` set to `speaker`
- **THEN** that recording reports layout `speaker`
- **AND** the room's `recording.layout` is still `grid`

#### Scenario: Incomplete encoding options rejected

- **WHEN** `recordingStart` is called with a `config.encoding` object that lacks the audio settings or any video field
- **THEN** the REST API answers `422` and starts nothing

### Requirement: A deliberate stop disarms the auto-start until the meeting ends

A stop requested through `recordingStop` (which the meeting's stop control and the `recordingStop`
command also use) SHALL keep the room's auto-start from starting another recording for the rest of
that meeting, on every replica. A recording that ends any other way SHALL leave the auto-start armed,
and the next meeting in the room SHALL auto-start again.

#### Scenario: No restart after a deliberate stop

- **GIVEN** a meeting whose recording was auto-started and then stopped through `recordingStop`
- **WHEN** another participant joins the same meeting
- **THEN** no new recording starts

#### Scenario: Next meeting records again

- **GIVEN** a meeting whose auto-started recording was stopped through `recordingStop`
- **WHEN** that meeting ends and a new meeting starts in the room, reaching the threshold
- **THEN** a new recording starts by itself

#### Scenario: A recording ended by the system keeps the auto-start armed

- **GIVEN** a meeting whose auto-started recording ended without a `recordingStop` call
- **WHEN** another participant joins the meeting with the threshold still met
- **THEN** a new recording starts by itself

#### Scenario: Stop and join handled by different replicas

- **GIVEN** two Meet replicas serving the same deployment
- **WHEN** replica A handles the `recordingStop` call and replica B handles a later join to the same meeting
- **THEN** replica B starts no recording

### Requirement: On-demand start refused in a room that records automatically

`recordingStart` SHALL answer `403` for a room whose `recording.autoStart` is set, so neither the
meeting nor the embedded API can start its recording by hand. Stopping the auto-started recording
SHALL stay allowed.

#### Scenario: Manual start in an auto-start room

- **GIVEN** a room with `recording.autoStart` set and a meeting in progress without a recording
- **WHEN** a caller holding `recordingControl` calls `recordingStart` for that room
- **THEN** the REST API answers `403`

#### Scenario: Auto-started recording stopped by hand

- **GIVEN** a room with `recording.autoStart` set whose recording is active
- **WHEN** a caller holding `recordingControl` calls `recordingStop` for it
- **THEN** the REST API answers `202`

### Requirement: Starting a recording through the REST API

`recordingStart` SHALL accept only an API key or a room member token holding `recordingControl` in
the target room, and SHALL answer `201` with the recording in the `starting` status and a `Location`
header pointing at it, without waiting for the recording to capture media. It SHALL answer `404` for
an unknown room, `409` when nobody is connected to the room or a recording is `starting`, `active` or
`ending` in it, and `503` when no egress service takes the recording.

#### Scenario: Start with an API key

- **GIVEN** a room with recording enabled and a meeting in progress
- **WHEN** `recordingStart` is called with an API key
- **THEN** the REST API answers `201` with a recording in the `starting` status and a `Location` header

#### Scenario: User access token not accepted

- **WHEN** `recordingStart` is called with only a user access token, even an `admin` one
- **THEN** the REST API answers `401`

#### Scenario: Room member token without the permission

- **WHEN** `recordingStart` is called with a room member token lacking `recordingControl`, or issued for another room
- **THEN** the REST API answers `403`

#### Scenario: Unknown room

- **WHEN** `recordingStart` is called for a room that does not exist
- **THEN** the REST API answers `404`

#### Scenario: No meeting in progress

- **GIVEN** a room with recording enabled and nobody connected
- **WHEN** `recordingStart` is called for it
- **THEN** the REST API answers `409`

#### Scenario: Room already being recorded

- **GIVEN** a room whose recording is active
- **WHEN** `recordingStart` is called for it again
- **THEN** the REST API answers `409`

#### Scenario: Media server does not accept the recording

- **GIVEN** a room with recording enabled, a meeting in progress and the deployment's egress service down
- **WHEN** `recordingStart` is called for it
- **THEN** the REST API answers `503` with error `LiveKit Error`
- **AND** no recording is created and the room has no recording in progress
- **AND** a later `recordingStart`, once the egress service is back, answers `201`

### Requirement: One recording in progress per room across replicas

The server SHALL let a room have at most one recording in progress, whichever replica receives each
start, and SHALL make the room recordable again as soon as that recording has ended or the media
server refused to start it.

#### Scenario: Concurrent starts on two replicas

- **GIVEN** two Meet replicas and a room with a meeting in progress and no recording
- **WHEN** replica A and replica B each receive `recordingStart` for that room at the same time
- **THEN** one call answers `201` and the other answers `409`
- **AND** the room has exactly one recording

#### Scenario: Start refused by the media server

- **GIVEN** a room with a meeting in progress whose recording start the media server refuses
- **WHEN** `recordingStart` is called again once the media server accepts recordings
- **THEN** the REST API answers `201`

### Requirement: Stopping a recording

`recordingStop` SHALL accept only an API key or a room member token holding `recordingControl` in the
recording's room, and SHALL answer `202` with the recording for a recording that is `starting` or
`active`, its final status being reported afterwards; `409` for one already `ending` or ended and
`404` for an unknown one. A recording stopped while `starting` SHALL end `aborted`, without a file.

#### Scenario: Stop an active recording

- **GIVEN** an active recording
- **WHEN** a caller holding `recordingControl` calls `recordingStop` for it
- **THEN** the REST API answers `202`
- **AND** the recording later reaches `complete` with its file available

#### Scenario: Stop a recording still waiting for its first track

- **GIVEN** a recording in the `starting` status
- **WHEN** `recordingStop` is called for it
- **THEN** the REST API answers `202`
- **AND** the recording ends `aborted` without a file

#### Scenario: Caller without the permission

- **WHEN** `recordingStop` is called with a room member token lacking `recordingControl`, or with only a user access token
- **THEN** the REST API answers `403`, or `401` for the user access token

#### Scenario: Unknown recording

- **WHEN** `recordingStop` is called with a well-formed id that matches no recording
- **THEN** the REST API answers `404`

#### Scenario: Recording already stopped

- **GIVEN** a recording that has just been stopped
- **WHEN** `recordingStop` is called for it again
- **THEN** the REST API answers `409`

### Requirement: Stops are serialized per room across replicas

The server SHALL run one stop at a time per room, whichever replica receives it, and SHALL answer
`409` to a stop arriving while another one for the same room is in flight.

#### Scenario: Two stops on two replicas

- **GIVEN** two Meet replicas and an active recording in an auto-start room
- **WHEN** replica A and replica B each receive `recordingStop` for it at the same time
- **THEN** one call answers `202` and the other answers `409`
- **AND** the auto-start stays disarmed for the rest of the meeting

### Requirement: Recording identifiers

Every recording SHALL be identified by a `recordingId` made of three parts joined by `--`: the room
id, an identifier starting with `EG_` and a unique suffix (for example `room-123--EG_XYZ--XX445`), and
every operation that takes recording ids SHALL reject a malformed one with `422`.

#### Scenario: Malformed recording id

- **WHEN** an authenticated caller sends `recordingGet`, `recordingDelete`, `recordingStop` or `recordingBulkDelete` an id that does not follow the format
- **THEN** the REST API answers `422`

#### Scenario: Well-formed unknown recording id

- **WHEN** `recordingGet` is called with an API key and a well-formed id that matches no recording
- **THEN** the REST API answers `404`

### Requirement: Recording list scope

`recordingList` SHALL return every recording to an API key or an `admin` user; to a room member token
holding `recordingList`, only those of its room whatever the `roomId` filter (`403` without the
permission); and to `room_manager` and `room_member` users, only those of rooms they own, rooms where
their membership holds `recordingList`, and rooms open to registered users whose speaker role holds
`recordingList`, leaving the rest out. A `recordingSecret` SHALL NOT authenticate the list.

#### Scenario: Room member token scoped to its room

- **GIVEN** recordings in rooms A and B and a room member token of room A holding `recordingList`
- **WHEN** `recordingList` is called with that token and `roomId` set to B
- **THEN** the REST API answers `200` with the recordings of room A only

#### Scenario: Room member token without the permission

- **WHEN** `recordingList` is called with a room member token lacking `recordingList`
- **THEN** the REST API answers `403`

#### Scenario: Recording secret alone

- **WHEN** `recordingList` is called with only a `recordingSecret` query parameter
- **THEN** the REST API answers `401`

#### Scenario: Member with the permission

- **GIVEN** a `room_member` user who is a member of room A with `recordingList`, and recordings in room A and in a room B the user has no access to
- **WHEN** the user calls `recordingList`
- **THEN** the REST API answers `200` with the recordings of room A only

#### Scenario: User with no access to any recorded room

- **GIVEN** recordings only in rooms a `room_manager` user neither owns, nor is a member of, nor may enter as a registered user
- **WHEN** the user calls `recordingList`
- **THEN** the REST API answers `200` with an empty list

#### Scenario: Unauthenticated caller

- **WHEN** `recordingList` is called without credentials
- **THEN** the REST API answers `401`

### Requirement: Recording list filtering, sorting and pagination

`recordingList` SHALL filter by `roomId` (which wins over `roomName`), by `roomName` (exact by
default, or prefix, partial or regex match, optionally case-insensitive) and by `status`; SHALL sort
by `startDate` (default, newest first), `roomName`, `duration` or `size`; and SHALL paginate with
`maxItems` (default `10`, values above `100` served as `100`) and `nextPageToken`. Every page SHALL
apply the same filters and the same list scope as the first, whatever `fields` holds.

#### Scenario: Default order

- **WHEN** `recordingList` is called without sort parameters
- **THEN** the recordings come newest `startDate` first, at most 10 per page

#### Scenario: Oversized page

- **WHEN** `recordingList` is called with `maxItems` set to `500`
- **THEN** the page holds at most 100 recordings and reports `maxItems` as `100`

#### Scenario: Later pages keep the caller's scope

- **GIVEN** a `room_member` user whose membership of room A holds `recordingList`, two recordings in room A, and an older recording in a room B the user has no access to
- **WHEN** the user pages through `recordingList` with `maxItems=1`
- **THEN** the pages together hold the two recordings of room A only

#### Scenario: Paging with a field selection

- **GIVEN** two recordings
- **WHEN** `recordingList` is called with `fields=recordingId` and `maxItems=1` and then with the returned `nextPageToken`
- **THEN** the second page holds the other recording, carrying only `recordingId`

#### Scenario: Invalid parameters

- **WHEN** `recordingList` is called with `maxItems` set to `0`, an unknown `status`, or an invalid regular expression in regex mode
- **THEN** the REST API answers `422`

#### Scenario: Invalid page token

- **WHEN** `recordingList` is called with a `nextPageToken` the server did not issue
- **THEN** the REST API answers `400`

### Requirement: Recording response field selection

`recordingList`, `recordingGet`, `recordingStart` and `recordingStop` SHALL return only the recording
fields named in the `fields` query parameter and the `X-Fields` header together, ignoring unknown
names, and every field when none is named.

#### Scenario: Header and query parameter combined

- **WHEN** `recordingList` is called with `fields=recordingId` and the header `X-Fields: status`
- **THEN** each recording in the response carries only `recordingId` and `status`

### Requirement: Reading a recording

`recordingGet` SHALL return the recording to a caller holding `recordingPlay` in the recording's room
or presenting a valid `recordingSecret` (see "Access with a recording secret"), and SHALL answer
`403` to any other authenticated caller.

#### Scenario: Listing without playing

- **GIVEN** a room member token holding `recordingList` but not `recordingPlay`
- **WHEN** `recordingGet` is called with it for a recording of its room
- **THEN** the REST API answers `403`

#### Scenario: Owner of the room

- **GIVEN** a `room_manager` user who owns the recording's room
- **WHEN** the user calls `recordingGet`
- **THEN** the REST API answers `200`

### Requirement: Playing a recording's media

`recordingGetMedia` SHALL stream a `complete` recording as `video/mp4` to a caller holding
`recordingPlay` or presenting a valid `recordingSecret`, SHALL answer `409` for a recording that is
not `complete`, and SHALL serve a single `bytes=start-end` or `bytes=start-` range as `206` with its
`Content-Range`. Credentials MAY travel as query parameters so a video element can play it (see
`authentication`).

#### Scenario: Full media

- **WHEN** `recordingGetMedia` is called for a complete recording without a `Range` header
- **THEN** the REST API answers `200` with the whole file as `video/mp4`

#### Scenario: Byte range

- **WHEN** `recordingGetMedia` is called with `Range: bytes=0-1023`
- **THEN** the REST API answers `206` with those bytes and a `Content-Range` header

#### Scenario: Range out of the file

- **WHEN** the range starts at or beyond the file size
- **THEN** the REST API answers `416`

#### Scenario: Unsupported range form

- **WHEN** the `Range` header is a suffix range, a list of ranges or uses a unit other than `bytes`
- **THEN** the REST API answers `422`

#### Scenario: Recording in progress

- **WHEN** `recordingGetMedia` is called for an active recording
- **THEN** the REST API answers `409`

### Requirement: Downloading a recording

`recordingDownload` SHALL serve the same media as `recordingGetMedia`, as an attachment named after the recording's filename (or `{recordingId}.mp4`), gated by `recordingDownload` instead of `recordingPlay`, or by a `recordingSecret` that grants download (see "Access with a recording secret").

#### Scenario: Play granted, download denied

- **GIVEN** a room member token holding `recordingPlay` but not `recordingDownload`
- **WHEN** it calls `recordingGetMedia` and then `recordingDownload` for a recording of its room
- **THEN** the first call answers `200` and the second answers `403`

#### Scenario: Download granted, play denied

- **GIVEN** a room member token holding `recordingDownload` but not `recordingPlay`
- **WHEN** it calls `recordingDownload`
- **THEN** the REST API answers `200` with a `Content-Disposition: attachment` header

### Requirement: Downloading several recordings as a ZIP

`recordingBulkDownload` SHALL accept up to 100 distinct `recordingIds` and answer `422` to more, SHALL
answer with a `recordings.zip` attachment holding the requested recordings the caller may download
(`recordingDownload`, checked per recording) and that are `complete`, leaving the others out, and
SHALL answer `400` when the caller may download none of them. The app SHALL NOT offer the ZIP
download for a selection of more than 100 recordings.

#### Scenario: Mixed rooms with a room member token

- **GIVEN** a room member token of room A holding `recordingDownload`
- **WHEN** it calls `recordingBulkDownload` for one recording of room A and one of room B
- **THEN** the ZIP holds only the recording of room A

#### Scenario: Nothing downloadable

- **WHEN** `recordingBulkDownload` is called with ids of recordings the caller may not download
- **THEN** the REST API answers `400`

#### Scenario: Too many ids

- **WHEN** `recordingBulkDownload` is called with 101 distinct recording ids
- **THEN** the REST API answers `422` and builds no ZIP

#### Scenario: Large selection in the app

- **GIVEN** a user who selected 101 complete recordings in a recordings list of the app
- **WHEN** the user looks at the bulk actions
- **THEN** the ZIP download is disabled with an explanation of the 100-recording limit

### Requirement: Deleting a recording

`recordingDelete` SHALL require `recordingDelete` in the recording's room (a `recordingSecret` grants
nothing here), SHALL delete a recording whose status is final together with its file, and SHALL
answer `409` while the recording is `starting`, `active` or `ending` and `404` for an unknown one.

#### Scenario: Delete a finished recording

- **GIVEN** a complete recording and a caller holding `recordingDelete`
- **WHEN** the caller calls `recordingDelete`
- **THEN** the REST API answers `200`
- **AND** the recording is no longer listed and its media answers `404`

#### Scenario: Delete a recording in progress

- **WHEN** `recordingDelete` is called for an active recording
- **THEN** the REST API answers `409`

#### Scenario: Caller without the permission

- **WHEN** `recordingDelete` is called with credentials lacking `recordingDelete`, or with only a `recordingSecret`
- **THEN** the REST API answers `403`, or `401` for the secret alone

### Requirement: Deleting recordings in bulk

`recordingBulkDelete` SHALL accept up to 100 distinct `recordingIds` and answer `422` to more,
SHALL delete every requested recording the caller may delete (`recordingDelete`, checked per
recording) whose status is final, SHALL answer `200` when all of them were deleted, and SHALL
otherwise answer `400` listing the deleted ids and each failed id with its reason, keeping the
deletions it made. The app SHALL NOT offer bulk delete for a selection of more than 100.

#### Scenario: All deleted

- **WHEN** `recordingBulkDelete` is called with ids of finished recordings the caller may delete
- **THEN** the REST API answers `200` and every one of them is deleted

#### Scenario: Partial result

- **WHEN** `recordingBulkDelete` is called with one finished recording, one active recording and one unknown id
- **THEN** the REST API answers `400` with the finished one in `deleted` and the other two in `failed`
- **AND** the finished recording is deleted

#### Scenario: Too many ids

- **WHEN** `recordingBulkDelete` is called with 101 distinct recording ids
- **THEN** the REST API answers `422` and deletes nothing

#### Scenario: Repeated ids

- **WHEN** `recordingBulkDelete` is called with the same finished recording id twice
- **THEN** the REST API answers `200` with that recording once in `deleted`

#### Scenario: Large selection in the app

- **GIVEN** a user who selected 101 finished recordings they may delete in a recordings list of the app
- **WHEN** the user looks at the bulk actions
- **THEN** the bulk delete is disabled with an explanation of the 100-recording limit

### Requirement: Shareable recording links

`recordingGetUrl` SHALL require `recordingPlay` and return a link to the recording view page holding one of the recording's secrets, which never change: a public one by default, refused with `403` while the room's `access.anonymous.recording.enabled` is `false`, or a private one with `privateAccess=true`, always available. The link SHALL grant download only when the caller holds `recordingDownload`; otherwise it SHALL grant play only.

#### Scenario: Public link

- **GIVEN** a room with anonymous recording access enabled
- **WHEN** `recordingGetUrl` is called for one of its recordings
- **THEN** the REST API answers `200` with a `/recording/{recordingId}?recordingSecret=...` link

#### Scenario: Public link with anonymous recording access disabled

- **GIVEN** a room with `access.anonymous.recording.enabled` set to `false`
- **WHEN** `recordingGetUrl` is called without `privateAccess`
- **THEN** the REST API answers `403`
- **AND** the same call with `privateAccess=true` answers `200`

#### Scenario: Caller allowed to play but not to download

- **GIVEN** a room member whose permissions hold `recordingPlay` but not `recordingDownload`
- **WHEN** they call `recordingGetUrl` for a recording of that room, with or without `privateAccess`
- **THEN** the REST API answers `200` with a link whose holder can play the recording
- **AND** `recordingDownload` with that link's secret answers `403`

#### Scenario: Caller allowed to download

- **GIVEN** a caller holding `recordingPlay` and `recordingDownload`, such as an API key, an `admin` user or the room's owner
- **WHEN** they call `recordingGetUrl` for a recording of that room
- **THEN** the link's holder can play and download the recording

#### Scenario: Links shared before this release

- **GIVEN** a public link to a recording obtained before this release
- **WHEN** `recordingDownload` is called with its secret
- **THEN** the REST API answers `200`, as before

### Requirement: Access with a recording secret

A public secret SHALL grant access to `recordingGet`, `recordingGetMedia` and `recordingDownload` on its own, without any credential, while the room's anonymous recording access is enabled, and `403` while it is disabled. A private secret SHALL waive the recording permission for any authenticated caller and answer `401` without a credential. A play-only secret SHALL answer `403` on `recordingDownload`. An unrecognised secret SHALL answer `400` whatever credential comes with it.

#### Scenario: Public secret without credentials

- **WHEN** `recordingGetMedia` is called with the public secret and no credential
- **THEN** the REST API answers `200`

#### Scenario: Anonymous recording access disabled after sharing

- **GIVEN** a public link issued while anonymous recording access was enabled
- **WHEN** the room's `access.anonymous.recording.enabled` becomes `false` and the link is used, with or without credentials
- **THEN** the REST API answers `403`
- **AND** the link works again once anonymous recording access is enabled again

#### Scenario: Private secret

- **GIVEN** a registered user with no access to the recording's room
- **WHEN** the user calls `recordingGet` with the private secret
- **THEN** the REST API answers `200`
- **AND** the same call without any credential answers `401`

#### Scenario: Play-only public secret

- **WHEN** `recordingGetMedia` is called with a play-only public secret and no credential
- **THEN** the REST API answers `200`
- **AND** `recordingDownload` with the same secret answers `403`

#### Scenario: Play-only private secret

- **GIVEN** a registered user with no access to the recording's room
- **WHEN** the user calls `recordingGetMedia` and then `recordingDownload` with a play-only private secret
- **THEN** the REST API answers `200` to the first and `403` to the second

#### Scenario: Unrecognised secret

- **WHEN** `recordingGet` is called with a `recordingSecret` that is not one of the recording's secrets, even with an API key
- **THEN** the REST API answers `400`

### Requirement: Recordings outlive their meeting

The server SHALL keep each recording and its file in the deployment's object storage (see
`deployment`) after its meeting ends, until the recording is deleted through `recordingDelete`,
`recordingBulkDelete` or the deletion of its room under the policies of `rooms`.

#### Scenario: Recording available after the meeting

- **GIVEN** a meeting that produced a complete recording
- **WHEN** the meeting ends and the room is closed
- **THEN** the recording is still listed and its media is still served

### Requirement: Clean-up of rooms left unable to record

Once per cluster every 15 minutes, the server SHALL make a room recordable again when the media
server has no recording in progress for it but the room is still held as being recorded, for
example after a replica crashed before processing a recording's end. A hold younger than 30 seconds
or a recording still in progress, even one waiting for its first track, SHALL keep the room held.

#### Scenario: Room freed after a lost recording end

- **GIVEN** a room held as being recorded for more than 30 seconds while the media server has no recording in progress for it
- **WHEN** the clean-up runs
- **THEN** `recordingStart` for that room answers `201` again during its next meeting

#### Scenario: Two replicas

- **GIVEN** two Meet replicas sharing the deployment
- **WHEN** the clean-up time comes
- **THEN** only one replica runs it

### Requirement: Console recordings page

The console's Recordings page, available to `admin`, `room_manager` and `room_member` users, SHALL
list the recordings `recordingList` returns to the user, searchable by room name with the same match
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

### Requirement: Embedded attributes for recordings

The embedded element SHALL show the recording view instead of the meeting when given `recording-url`
(a link from `recordingGetUrl`) or `show-recording` with a recording id next to `room-url`, and the
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

### Requirement: A ZIP download does not block other downloads

Building the ZIP of `recordingBulkDownload` SHALL release every stored recording it opened when the ZIP ends, fails or is cancelled by the client, and SHALL NOT prevent other playbacks, downloads and ZIPs on the same replica, whatever the number of recordings in the ZIP, of concurrent ZIPs or of cancelled ones.

#### Scenario: ZIP of 100 recordings

- **GIVEN** 100 complete recordings the caller may download
- **WHEN** `recordingBulkDownload` is called with their ids
- **THEN** the REST API answers the ZIP holding the 100 recordings

#### Scenario: Concurrent ZIPs

- **GIVEN** two callers who each request a ZIP of 30 recordings at the same time
- **WHEN** both downloads run
- **THEN** both ZIPs complete

#### Scenario: Cancelled ZIP

- **GIVEN** a ZIP of 40 recordings the client cancels after receiving part of it
- **WHEN** another caller then plays or downloads a recording
- **THEN** that playback or download answers normally

### Requirement: A lost recording never blocks the room

When the egress service recording a meeting stops responding, the server SHALL end the recording `failed`, with the error `The egress service stopped responding`, send its `recordingEnded` webhook and make the room recordable again, instead of keeping the recording in progress.

#### Scenario: Egress service killed while recording

- **GIVEN** a meeting with an active recording
- **WHEN** the egress service running the recording dies
- **THEN** the recording ends `failed` and `recordingEnded` is sent
- **AND** `recordingStop` for it answers `409`
- **AND** `recordingStart` for the room answers `201` once an egress service is available

#### Scenario: Next meeting of the room

- **GIVEN** a room whose recording was lost that way
- **WHEN** a new meeting starts in the room
- **THEN** `meetingGet` reports no recording in progress

### Requirement: A recording's end frees the room before it is reported

When the media server reports the end of a recording process, the server SHALL make the room recordable again, even if it never stored that recording, and SHALL send `recordingEnded` and the meeting's end notice only after the room is recordable again, so a start requested on receiving either is not refused. An end reported again for a recording that has already ended SHALL leave the room as it is.

#### Scenario: Start right after recordingEnded

- **GIVEN** a registered webhook endpoint and a meeting whose recording has just ended
- **WHEN** the endpoint receives `recordingEnded` and calls `recordingStart` for the room at once
- **THEN** the REST API answers `201`

#### Scenario: End of a recording that was never stored

- **GIVEN** a room held for a recording whose start the server could not store
- **WHEN** the media server reports that recording's end
- **THEN** `recordingStart` for the room answers `201` without waiting for the orphaned-hold clean-up

#### Scenario: A repeated end leaves a newer recording's hold

- **GIVEN** a meeting whose recording has ended and a new recording requested right after
- **WHEN** the end of the first recording is reported again, by another replica or a later clean-up, before the new recording is in progress
- **THEN** a further `recordingStart` for the room answers `409`
