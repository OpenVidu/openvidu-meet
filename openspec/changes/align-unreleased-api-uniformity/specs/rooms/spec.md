## MODIFIED Requirements

### Requirement: Room creation
The server SHALL create a room on `roomCreate` (`POST /api/v1/rooms`) when the request is authenticated with an API key or by a user with the `admin` or `room_manager` role, answering `201` with the room and a `Location` header that points to `/api/v1/rooms/{roomId}`. A new room SHALL start with status `open` and `meetingEndAction` `none`.

#### Scenario: Room manager creates a room
- **GIVEN** a user with the `room_manager` role is logged in
- **WHEN** they call `roomCreate` with `roomName` `Weekly sync`
- **THEN** the server answers `201` with the created room
- **AND** the `Location` header points to `/api/v1/rooms/{roomId}` of that room
- **AND** the room's `status` is `open` and its `meetingEndAction` is `none`

#### Scenario: A user with the room_member role cannot create rooms
- **GIVEN** a user with the `room_member` role is logged in
- **WHEN** they call `roomCreate`
- **THEN** the server answers `403` and creates no room

#### Scenario: Unauthenticated creation
- **GIVEN** a request carrying neither an API key nor an access token
- **WHEN** it calls `roomCreate`
- **THEN** the server answers `401`

#### Scenario: Invalid creation body
- **GIVEN** an API key
- **WHEN** it calls `roomCreate` with a body whose fields have the wrong types
- **THEN** the server answers `422` with the validation details and creates no room
- **AND** a body that is not valid JSON is answered with `400`

### Requirement: Room name
The server SHALL accept an optional `roomName` of at most 50 characters, remove its surrounding whitespace and collapse repeated whitespace, and SHALL name the room `Room` when the name is omitted, `null`, empty or blank. Room names SHALL NOT need to be unique.

#### Scenario: Name omitted
- **WHEN** `roomCreate` is called without `roomName`
- **THEN** the created room's `roomName` is `Room`

#### Scenario: Whitespace is normalized
- **WHEN** `roomCreate` is called with `roomName` `  Team   sync  `
- **THEN** the created room's `roomName` is `Team sync`

#### Scenario: Name too long
- **WHEN** `roomCreate` is called with a `roomName` of 51 characters, or with a `roomName` that is not a string
- **THEN** the server answers `422`

#### Scenario: Two rooms with the same name
- **GIVEN** a room named `Standup` exists
- **WHEN** `roomCreate` is called again with `roomName` `Standup`
- **THEN** a second room is created with a different `roomId`

### Requirement: Room identifier
The server SHALL generate every `roomId`, which callers cannot choose, as a prefix derived from the room name followed by a hyphen and a random suffix. The prefix SHALL be the name lowercased, with accents and every character other than letters, digits and underscores removed, spaces and hyphens turned into single underscores and no leading or trailing underscore, or `room` when nothing remains.

#### Scenario: Prefix derived from an accented name
- **WHEN** `roomCreate` is called with `roomName` `Reunión de Equipo`
- **THEN** the created `roomId` starts with `reunion_de_equipo-`

#### Scenario: Name without usable characters
- **WHEN** `roomCreate` is called with a `roomName` made only of emoji or of characters outside the Latin alphabet
- **THEN** the created `roomId` starts with `room-`

### Requirement: Room identifier in request paths
The server SHALL remove from a `{roomId}` path parameter every character other than letters, digits, hyphens and underscores before looking the room up, and SHALL answer `422` when the identifier exceeds 100 characters or nothing remains after that removal. A room that does not exist SHALL be answered with `404`.

#### Scenario: Identifier with characters to strip
- **GIVEN** a room `room-123` exists
- **WHEN** `roomGet` is called for `room-123!`
- **THEN** the server answers `200` with room `room-123`

#### Scenario: Identifier empty after stripping
- **WHEN** `roomGet` is called for `!!!`
- **THEN** the server answers `422`

#### Scenario: Unknown room
- **WHEN** `roomGet`, `roomDelete` or `roomUpdateStatus` is called for a room that does not exist
- **THEN** the server answers `404`

### Requirement: Room ownership
The server SHALL record as the room's `owner` the `userId` of the user who created it, or the root admin (`MEET_INITIAL_ADMIN_USER`, see `users`) when the room was created with an API key. A room SHALL always have an owner able to manage it: when its owner is deleted or loses the right to own rooms, the room passes to the root admin (see `users` for when that happens).

#### Scenario: Room created with an API key
- **WHEN** `roomCreate` is called with an API key
- **THEN** the room's `owner` is the root admin

#### Scenario: Owner deleted
- **GIVEN** a `room_manager` user owns two rooms
- **WHEN** an admin deletes that user
- **THEN** both rooms still exist and their `owner` is the root admin

### Requirement: Field projection of room responses
Every room the server returns from `roomCreate`, `roomGet`, `roomList`, `roomUpdateStatus`, `roomDelete` and `roomBulkDelete` SHALL leave out the extra fields `config` and `roles` unless requested, SHALL contain only the fields named in `fields` (or the `X-Fields` header) when given, plus the extra fields named in `extraFields` (or `X-ExtraFields`), and SHALL list the available extra fields in `_extraFields`. Query and header values SHALL combine, and unknown names SHALL be ignored.

#### Scenario: Default projection
- **WHEN** `roomGet` is called without projection parameters
- **THEN** the room carries every base field but neither `config` nor `roles`
- **AND** `_extraFields` lists `config` and `roles`

#### Scenario: Selected fields plus an extra field
- **WHEN** `roomGet` is called with `fields=roomId,roomName` and the header `X-ExtraFields: config`
- **THEN** the room carries only `roomId`, `roomName` and `config`

#### Scenario: Header and query combine
- **WHEN** `roomList` is called with `fields=roomId` and the header `X-Fields: roomName`
- **THEN** each listed room carries `roomId` and `roomName`

#### Scenario: Unknown names
- **WHEN** `roomList` is called with `extraFields=foo`
- **THEN** the server answers `200` and the rooms carry neither `config` nor `roles`

### Requirement: Reading a room
The server SHALL return a room on `roomGet` to an API key, to a room member token issued for that same room, and to a logged-in user allowed into the room (see `room-access`), and SHALL answer `403` to any other caller.

#### Scenario: Owner reads their room
- **GIVEN** a `room_manager` user owns a room
- **WHEN** they call `roomGet` for it
- **THEN** the server answers `200` with the room

#### Scenario: Room member token of another room
- **GIVEN** a room member token issued for room A
- **WHEN** it is used to call `roomGet` for room B
- **THEN** the server answers `403`

### Requirement: Room list visibility
The server SHALL answer `roomList` for an API key and for users of every role. An API key and an `admin` user SHALL see every room. When no scope filter is given, a `room_manager` user SHALL see the rooms they own, are a member of or that have user access enabled, and a `room_member` user the rooms they are a member of or that have user access enabled. A non-admin user filtering by `owner` or `member` with another user's id SHALL get `403`.

#### Scenario: Administrator sees every room
- **GIVEN** rooms owned by several users
- **WHEN** an `admin` user calls `roomList`
- **THEN** every room is listed

#### Scenario: Room manager default scope
- **GIVEN** a `room_manager` user owns room A, is a member of room B, room C has user access enabled and room D has none of these
- **WHEN** they call `roomList` without scope filters
- **THEN** rooms A, B and C are listed and room D is not

#### Scenario: Filtering by another user
- **GIVEN** a `room_member` user is logged in
- **WHEN** they call `roomList` with `member` set to another user's id
- **THEN** the server answers `403`

### Requirement: Room list filters
`roomList` SHALL combine the scope filters `owner`, `member` and `userAccess` with OR, and SHALL narrow the result with `status` and with `roomName`, matched according to `roomNameMatchMode` (`exact` by default, `prefix`, `partial` or `regex`) and `roomNameCaseInsensitive` (`false` by default). A regular expression that does not compile, is longer than 100 characters or uses a quantifier above 65535 SHALL be answered with `422`.

#### Scenario: Prefix match
- **GIVEN** rooms named `team-alpha`, `team-beta` and `sales`
- **WHEN** `roomList` is called with `roomName=team` and `roomNameMatchMode=prefix`
- **THEN** only `team-alpha` and `team-beta` are listed

#### Scenario: Scope filters are a union
- **WHEN** an `admin` user calls `roomList` with `owner` set to a user id and `userAccess=true`
- **THEN** the list holds the rooms owned by that user and the rooms with user access enabled

#### Scenario: Status filter
- **WHEN** `roomList` is called with `status=closed`
- **THEN** only closed rooms are listed

#### Scenario: Invalid regular expression
- **WHEN** `roomList` is called with `roomNameMatchMode=regex` and `roomName=a{1000000}`
- **THEN** the server answers `422` naming `roomName`

### Requirement: Room list pagination and sorting
`roomList` SHALL return pages of at most `maxItems` rooms (10 by default, capped to 100, rounded down, echoed in `pagination.maxItems`) with `pagination.isTruncated` and a `nextPageToken` that resumes the listing, sorted by `sortField` (`creationDate` by default, `roomName` or `autoDeletionDate`) in `sortOrder` (`desc` by default). A zero, negative or non-numeric `maxItems` SHALL get `422`, and a `nextPageToken` the server did not issue `400`.

#### Scenario: Paging through rooms
- **GIVEN** three rooms exist
- **WHEN** `roomList` is called with `maxItems=2` and then with the returned `nextPageToken`
- **THEN** the first page holds two rooms with `isTruncated` `true`
- **AND** the second page holds the remaining room with `isTruncated` `false`

#### Scenario: maxItems above the cap
- **WHEN** `roomList` is called with `maxItems=101`
- **THEN** the server answers `200` and `pagination.maxItems` is `100`

#### Scenario: Forged page token
- **WHEN** `roomList` is called with a `nextPageToken` the server did not issue
- **THEN** the server answers `400`

### Requirement: Room list pages keep the query
Every page of `roomList` SHALL apply the filters and the access scope of the first page, and SHALL continue the listing whatever `fields` holds.

#### Scenario: Later pages keep the caller's scope
- **GIVEN** a `room_member` user who is a member of room A, a room B open to registered users, and rooms C and D they have no access to
- **WHEN** the user pages through `roomList` with `maxItems=1`
- **THEN** the pages together hold rooms A and B only

#### Scenario: Paging with a field selection
- **GIVEN** three rooms exist
- **WHEN** `roomList` is called with `fields=roomId` and `maxItems=2` and then with the returned `nextPageToken`
- **THEN** the second page holds the remaining room
- **AND** every room in both pages carries only `roomId`

### Requirement: Room status follows its meetings
A room's `status` SHALL be `active_meeting` while a meeting runs in it (see `meetings` for when a meeting starts and ends, and for the periodic reconciliation with the media server). When that meeting ends, the room SHALL apply its pending `meetingEndAction`: `close` leaves it `closed`, `delete` deletes it with its recordings and members, and `none` returns it to `open`; the action SHALL then be reset to `none`.

#### Scenario: Meeting starts and ends
- **GIVEN** an open room
- **WHEN** a meeting starts in it and later ends with no pending action
- **THEN** the room is `active_meeting` during the meeting and `open` afterwards

#### Scenario: Pending close applied at the end
- **GIVEN** a room in `active_meeting` with `meetingEndAction` `close`
- **WHEN** the meeting ends
- **THEN** the room is `closed` with `meetingEndAction` `none`

#### Scenario: Pending deletion applied at the end
- **GIVEN** a room in `active_meeting` with `meetingEndAction` `delete`
- **WHEN** the meeting ends
- **THEN** the room, its members and its recordings are deleted and `roomGet` answers `404`

### Requirement: Opening and closing a room
On `roomUpdateStatus` the server SHALL set a room without an active meeting to `open` or `closed` and answer `200`. While a meeting is active the room SHALL stay `active_meeting`: `closed` answers `202` and schedules `meetingEndAction` `close`, keeping a scheduled `delete`; `open` cancels a scheduled `close` and answers `200`, or `409` when `delete` is scheduled. Any other status SHALL get `422`. A closed room SHALL accept no new meeting (see `meeting-join`) and keep its recordings and members.

#### Scenario: Close an idle room
- **GIVEN** an open room without an active meeting
- **WHEN** its owner calls `roomUpdateStatus` with `closed`
- **THEN** the server answers `200` and the room is `closed`
- **AND** a participant asking to join its meeting afterwards is refused with `409`
- **AND** the room's recordings can still be listed and played

#### Scenario: Reopen a closed room
- **GIVEN** a closed room
- **WHEN** an admin calls `roomUpdateStatus` with `open`
- **THEN** the server answers `200` and the room is `open`

#### Scenario: Requesting active_meeting
- **WHEN** `roomUpdateStatus` is called with `active_meeting`
- **THEN** the server answers `422`

#### Scenario: Close scheduled for the end of the meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `roomUpdateStatus` with `closed`
- **THEN** the server answers `202` with `status` `active_meeting` and `meetingEndAction` `close`
- **AND** once the meeting ends the room is `closed` with `meetingEndAction` `none`

#### Scenario: Reopen during the meeting cancels the scheduled close
- **GIVEN** a room with an active meeting and `meetingEndAction` `close`
- **WHEN** its owner calls `roomUpdateStatus` with `open`
- **THEN** the server answers `200` with `status` `active_meeting` and `meetingEndAction` `none`
- **AND** once the meeting ends the room is `open`
- **AND** no second `meetingStarted` webhook is sent for the meeting

#### Scenario: Closing keeps a scheduled deletion
- **GIVEN** a room with an active meeting that `roomDelete` with `withMeeting=when_meeting_ends` scheduled for deletion
- **WHEN** its owner calls `roomUpdateStatus` with `closed`
- **THEN** the server answers `202` with `meetingEndAction` `delete`
- **AND** the room is deleted when the meeting ends

#### Scenario: Reopening a room scheduled for deletion
- **GIVEN** a room with an active meeting and `meetingEndAction` `delete`
- **WHEN** its owner calls `roomUpdateStatus` with `open`
- **THEN** the server answers `409` and the room keeps `status` `active_meeting` and `meetingEndAction` `delete`

#### Scenario: Meeting ends on another replica while the room is closed
- **GIVEN** two Meet replicas sharing MongoDB and a room with an active meeting
- **WHEN** replica A handles `roomUpdateStatus` with `closed` while replica B handles the end of that meeting
- **THEN** the room ends up `closed` with `meetingEndAction` `none`, never `open` with a pending `close`

### Requirement: Room management authorization
The server SHALL allow `roomUpdateStatus`, `roomDelete`, `roomUpdateConfig`, `roomUpdateRoles` and `roomUpdateAccess` only to an API key, to a user with the `admin` role, and to the room's owner, and SHALL answer `403` to any other user. A room member token SHALL never authorize them, whatever permissions it carries. Who may manage room members is specified in `room-members`.

#### Scenario: Room manager who does not own the room
- **GIVEN** a `room_manager` user who does not own room A
- **WHEN** they call `roomDelete` for room A
- **THEN** the server answers `403` and the room is kept

#### Scenario: Room member token on a management operation
- **GIVEN** a request carrying only a room member token for room A with every permission
- **WHEN** it calls `roomUpdateStatus` for room A
- **THEN** the server answers `401`

### Requirement: Deleting an idle room
On `roomDelete` for a room with no active meeting and no recordings, the server SHALL delete the room and its members and answer `200` with `successCode` `room_deleted`. When several deletions of the same room run at once, on one replica or on several, exactly one SHALL succeed and the others SHALL answer `404`, never `500`.

#### Scenario: Plain deletion
- **GIVEN** a room with no active meeting and no recordings
- **WHEN** its owner calls `roomDelete`
- **THEN** the server answers `200` with `successCode` `room_deleted`
- **AND** `roomGet` for it answers `404`

#### Scenario: Two replicas delete the same room
- **GIVEN** two Meet replicas sharing the same database
- **WHEN** each receives `roomDelete` for the same idle room at the same time
- **THEN** one answers `200` with `room_deleted` and the other answers `404`

### Requirement: Deletion policy for an active meeting
`roomDelete` on a room with an active meeting and no recordings SHALL follow `withMeeting`: `fail` (the default) answers `409` with error `room_has_active_meeting`; `force` ends the meeting for everyone, deletes the room once that end is processed and answers `200` with `room_with_active_meeting_deleted`; `when_meeting_ends` answers `202` with `room_with_active_meeting_scheduled_to_be_deleted` and the room with `meetingEndAction` `delete`.

#### Scenario: Default policy refuses
- **GIVEN** a room with an active meeting and no recordings
- **WHEN** `roomDelete` is called without policies
- **THEN** the server answers `409` with error `room_has_active_meeting` and the meeting goes on

#### Scenario: Forced deletion
- **GIVEN** a room with an active meeting and no recordings
- **WHEN** `roomDelete` is called with `withMeeting=force`
- **THEN** the server answers `200` with `successCode` `room_with_active_meeting_deleted`
- **AND** the meeting ends for every participant and the room is then deleted

#### Scenario: Deletion when the meeting ends
- **GIVEN** a room with an active meeting and no recordings
- **WHEN** `roomDelete` is called with `withMeeting=when_meeting_ends`
- **THEN** the server answers `202` with the room in `active_meeting` and `meetingEndAction` `delete`
- **AND** the room is deleted when the meeting ends

### Requirement: Deletion policy for recordings
`roomDelete` on a room with recordings and no active meeting SHALL follow `withRecordings`: `fail` (the default) answers `409` with error `room_has_recordings`; `force` deletes the room and its recordings and answers `200` with `room_and_recordings_deleted`; `close` keeps the room and its recordings, closes the room and answers `200` with `room_closed` and the room.

#### Scenario: Default policy refuses
- **GIVEN** a room with recordings and no active meeting
- **WHEN** `roomDelete` is called without policies
- **THEN** the server answers `409` with error `room_has_recordings`

#### Scenario: Room and recordings deleted
- **WHEN** `roomDelete` is called with `withRecordings=force` on that room
- **THEN** the server answers `200` with `successCode` `room_and_recordings_deleted` and the recordings are gone

#### Scenario: Room closed instead of deleted
- **WHEN** `roomDelete` is called with `withRecordings=close` on that room
- **THEN** the server answers `200` with `successCode` `room_closed` and the room in status `closed`
- **AND** its recordings are kept

### Requirement: Deletion of a room with an active meeting and recordings
`roomDelete` on a room with both an active meeting and recordings SHALL apply both policies together: it SHALL answer `409` and change nothing when either policy is `fail`, and otherwise SHALL end or wait for the meeting as `withMeeting` says and delete or close the room as `withRecordings` says, answering `200` when the meeting is forced and `202` when the outcome waits for the meeting to end. Each combination SHALL be named by its own success or error code.

#### Scenario: Meeting policy refuses
- **GIVEN** a room with an active meeting and recordings
- **WHEN** `roomDelete` is called without `withMeeting`
- **THEN** the server answers `409` with error `room_with_recordings_has_active_meeting`

#### Scenario: Meeting forced, recordings deleted
- **WHEN** `roomDelete` is called on that room with `withMeeting=force` and `withRecordings=force`
- **THEN** the server answers `200` with `successCode` `room_with_active_meeting_and_recordings_deleted`
- **AND** the meeting ends and the room and its recordings are deleted

#### Scenario: Meeting forced, recordings kept
- **WHEN** `roomDelete` is called on that room with `withMeeting=force` and `withRecordings=close`
- **THEN** the server answers `200` with `successCode` `room_with_active_meeting_closed`
- **AND** the meeting ends and the room is closed with its recordings kept

#### Scenario: Meeting forced, recordings policy refuses
- **WHEN** `roomDelete` is called on that room with `withMeeting=force` and no `withRecordings`
- **THEN** the server answers `409` with error `room_with_active_meeting_has_recordings` and the meeting goes on

#### Scenario: Scheduled deletion of room and recordings
- **WHEN** `roomDelete` is called on that room with `withMeeting=when_meeting_ends` and `withRecordings=force`
- **THEN** the server answers `202` with `successCode` `room_with_active_meeting_and_recordings_scheduled_to_be_deleted`
- **AND** the room and its recordings are deleted when the meeting ends

#### Scenario: Scheduled close
- **WHEN** `roomDelete` is called on that room with `withMeeting=when_meeting_ends` and `withRecordings=close`
- **THEN** the server answers `202` with `successCode` `room_with_active_meeting_scheduled_to_be_closed`
- **AND** the room is closed with its recordings kept when the meeting ends

#### Scenario: Recordings policy refuses a scheduled deletion
- **WHEN** `roomDelete` is called on that room with `withMeeting=when_meeting_ends` and no `withRecordings`
- **THEN** the server answers `409` with error `room_with_active_meeting_has_recordings_cannot_schedule_deletion`

### Requirement: Bulk deletion of rooms
On `roomBulkDelete` the server SHALL accept up to 100 comma-separated `roomIds`, cleaned like path identifiers and deduplicated, apply `withMeeting` and `withRecordings` to each room as `roomDelete` does, and answer `200` when every room was processed or `400` listing both the processed rooms in `deleted` and the others in `failed`. A room that does not exist or that the caller cannot manage SHALL only add an entry to `failed`. No usable id, or more than 100, SHALL be answered with `422`.

#### Scenario: Every room processed
- **GIVEN** two idle rooms owned by the caller
- **WHEN** they call `roomBulkDelete` with both ids
- **THEN** the server answers `200`, `failed` is empty and both rooms are deleted

#### Scenario: Partial failure
- **GIVEN** an idle room A and a room B with an active meeting, both owned by the caller
- **WHEN** they call `roomBulkDelete` with both ids and no policies
- **THEN** the server answers `400`, room A is listed in `deleted` and deleted
- **AND** room B is listed in `failed` with error `room_has_active_meeting`

#### Scenario: Room the caller cannot manage
- **GIVEN** a `room_manager` user who owns room A but not room B
- **WHEN** they call `roomBulkDelete` with both ids
- **THEN** room A is deleted and room B is listed in `failed` and kept

#### Scenario: Too many ids
- **WHEN** `roomBulkDelete` is called with 101 room ids
- **THEN** the server answers `422` and no room is deleted

### Requirement: Auto-deletion date and policy
`roomCreate` SHALL accept an optional `autoDeletionDate` that is at least one hour in the future and no later than 8640000000000000, and an `autoDeletionPolicy` whose `withMeeting` is `force` or `when_meeting_ends` (the default) and whose `withRecordings` is `force` or `close` (the default). The value `fail` in either policy and an out-of-range date SHALL be answered with `422`. A policy sent without a date SHALL be discarded.

#### Scenario: Date and default policy
- **WHEN** `roomCreate` is called with an `autoDeletionDate` two hours ahead and no policy
- **THEN** the room's `autoDeletionPolicy` is `withMeeting` `when_meeting_ends` and `withRecordings` `close`

#### Scenario: Date too close
- **WHEN** `roomCreate` is called with an `autoDeletionDate` 30 minutes ahead
- **THEN** the server answers `422`

#### Scenario: Fail policy rejected
- **WHEN** `roomCreate` is called with `autoDeletionPolicy.withRecordings` `fail`
- **THEN** the server answers `422`

#### Scenario: Policy without a date
- **WHEN** `roomCreate` is called with an `autoDeletionPolicy` and no `autoDeletionDate`
- **THEN** the created room has neither `autoDeletionDate` nor `autoDeletionPolicy`

### Requirement: Automatic deletion of expired rooms
Within one hour after a room's `autoDeletionDate` has passed, Meet SHALL process the room exactly as a `roomDelete` with the room's `autoDeletionPolicy`, and SHALL do so once for the whole cluster whatever the number of replicas. Until it is processed, the room SHALL keep working as before, new participants included. Rooms without a date, or with a date still ahead, SHALL be left untouched.

#### Scenario: Joining after the date, before processing
- **GIVEN** an open room whose `autoDeletionDate` passed a minute ago and that the sweep has not processed yet
- **WHEN** a participant joins with one of its access links
- **THEN** they enter the meeting as in any open room

#### Scenario: Expired idle room
- **GIVEN** a room without meeting or recordings whose `autoDeletionDate` has passed
- **WHEN** the expired-rooms sweep runs
- **THEN** the room is deleted

#### Scenario: Expired room with an active meeting
- **GIVEN** an expired room with policy `withMeeting` `when_meeting_ends` and an active meeting
- **WHEN** the sweep runs
- **THEN** the room stays `active_meeting` with `meetingEndAction` `delete` and is deleted when the meeting ends

#### Scenario: Expired room with recordings
- **GIVEN** an expired room with recordings, no meeting and policy `withRecordings` `close`
- **WHEN** the sweep runs
- **THEN** the room is closed and its recordings are kept

#### Scenario: Two replicas
- **GIVEN** two Meet replicas sharing database and Redis
- **WHEN** the sweep comes due on both
- **THEN** only one of them processes the expired rooms in that run

### Requirement: A deletion follows the meeting state it ends up facing
`roomDelete`, `roomBulkDelete` and the automatic deletion of expired rooms SHALL act on the room's state at the moment they write: a meeting that ended while the deletion was decided SHALL leave the room deleted or closed as an idle room, never open with a pending deletion, and a meeting that started meanwhile SHALL make the deletion follow the policy for an active meeting instead of deleting the room under it.

#### Scenario: Meeting ends while deletion is scheduled
- **GIVEN** a room with an active meeting whose last participant leaves
- **WHEN** `roomDelete` with `withMeeting=when_meeting_ends` is processed just after the meeting ended
- **THEN** the room is deleted and does not stay `open` with `meetingEndAction` `delete`
- **AND** a meeting held later in a room with the same id is not affected

#### Scenario: Meeting starts while an idle room is deleted
- **GIVEN** an idle room whose first participant is joining
- **WHEN** `roomDelete` without policies is processed just after the meeting started
- **THEN** the server answers `409` with error `room_has_active_meeting` and the meeting goes on

#### Scenario: Deletion and meeting end on different replicas
- **GIVEN** two Meet replicas, one receiving `roomDelete` and the other the end of the meeting
- **WHEN** both run at the same time
- **THEN** the room ends deleted exactly once, with its recordings handled as `withRecordings` says
