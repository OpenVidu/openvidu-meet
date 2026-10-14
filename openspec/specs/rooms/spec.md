# Rooms Specification

## Purpose

A room is the persistent space where Meet hosts one meeting at a time: this capability covers its lifecycle (creation, reading, listing, status, deletion, auto-deletion and ownership), relied on by integrators through the REST API and by users through the console rooms pages.

Surfaces: REST API (`createRoom`, `getRooms`, `getRoom`, `updateRoomStatus`, `deleteRoom`, `bulkDeleteRooms`; `meet-ce/backend/openapi/rooms/`), console (rooms list, room wizard and room detail pages). The room `config` object is specified in `room-config`, who may enter a room and the room role permission sets in `room-access`, room members in `room-members`, and when a meeting starts and ends in `meetings`. Documented in openvidu.io `docs/meet/features/rooms/overview.md` and `docs/meet/features/rooms/management.md`.

## Requirements

### Requirement: Room creation
The server SHALL create a room on `createRoom` (`POST /api/v1/rooms`) when the request is authenticated with an API key or by a user with the `admin` or `room_manager` role, answering `201` with the room and a `Location` header that points to `/api/v1/rooms/{roomId}`. A new room SHALL start with status `open` and `meetingEndAction` `none`.

#### Scenario: Room manager creates a room
- **GIVEN** a user with the `room_manager` role is logged in
- **WHEN** they call `createRoom` with `roomName` `Weekly sync`
- **THEN** the server answers `201` with the created room
- **AND** the `Location` header points to `/api/v1/rooms/{roomId}` of that room
- **AND** the room's `status` is `open` and its `meetingEndAction` is `none`

#### Scenario: A user with the room_member role cannot create rooms
- **GIVEN** a user with the `room_member` role is logged in
- **WHEN** they call `createRoom`
- **THEN** the server answers `403` and creates no room

#### Scenario: Unauthenticated creation
- **GIVEN** a request carrying neither an API key nor an access token
- **WHEN** it calls `createRoom`
- **THEN** the server answers `401`

#### Scenario: Invalid creation body
- **GIVEN** an API key
- **WHEN** it calls `createRoom` with a body whose fields have the wrong types
- **THEN** the server answers `422` with the validation details and creates no room
- **AND** a body that is not valid JSON is answered with `400`

### Requirement: Room name
The server SHALL accept an optional `roomName` of at most 50 characters, remove its surrounding whitespace and collapse repeated whitespace, and SHALL name the room `Room` when the name is omitted, `null`, empty or blank. Room names SHALL NOT need to be unique.

#### Scenario: Name omitted
- **WHEN** `createRoom` is called without `roomName`
- **THEN** the created room's `roomName` is `Room`

#### Scenario: Whitespace is normalized
- **WHEN** `createRoom` is called with `roomName` `  Team   sync  `
- **THEN** the created room's `roomName` is `Team sync`

#### Scenario: Name too long
- **WHEN** `createRoom` is called with a `roomName` of 51 characters, or with a `roomName` that is not a string
- **THEN** the server answers `422`

#### Scenario: Two rooms with the same name
- **GIVEN** a room named `Standup` exists
- **WHEN** `createRoom` is called again with `roomName` `Standup`
- **THEN** a second room is created with a different `roomId`

### Requirement: Room identifier
The server SHALL generate every `roomId`, which callers cannot choose, as a prefix derived from the room name followed by a hyphen and a random suffix. The prefix SHALL be the name lowercased, with accents and every character other than letters, digits and underscores removed, spaces and hyphens turned into single underscores and no leading or trailing underscore, or `room` when nothing remains.

#### Scenario: Prefix derived from an accented name
- **WHEN** `createRoom` is called with `roomName` `Reunión de Equipo`
- **THEN** the created `roomId` starts with `reunion_de_equipo-`

#### Scenario: Name without usable characters
- **WHEN** `createRoom` is called with a `roomName` made only of emoji or of characters outside the Latin alphabet
- **THEN** the created `roomId` starts with `room-`

### Requirement: Room identifier in request paths
The server SHALL remove from a `{roomId}` path parameter every character other than letters, digits, hyphens and underscores before looking the room up, and SHALL answer `422` when the identifier exceeds 100 characters or nothing remains after that removal. A room that does not exist SHALL be answered with `404`.

#### Scenario: Identifier with characters to strip
- **GIVEN** a room `room-123` exists
- **WHEN** `getRoom` is called for `room-123!`
- **THEN** the server answers `200` with room `room-123`

#### Scenario: Identifier empty after stripping
- **WHEN** `getRoom` is called for `!!!`
- **THEN** the server answers `422`

#### Scenario: Unknown room
- **WHEN** `getRoom`, `deleteRoom` or `updateRoomStatus` is called for a room that does not exist
- **THEN** the server answers `404`

### Requirement: Room ownership
The server SHALL record as the room's `owner` the `userId` of the user who created it, or the root admin (`MEET_INITIAL_ADMIN_USER`, see `users`) when the room was created with an API key. A room SHALL always have an owner able to manage it: when its owner is deleted or loses the right to own rooms, the room passes to the root admin (see `users` for when that happens).

#### Scenario: Room created with an API key
- **WHEN** `createRoom` is called with an API key
- **THEN** the room's `owner` is the root admin

#### Scenario: Owner deleted
- **GIVEN** a `room_manager` user owns two rooms
- **WHEN** an admin deletes that user
- **THEN** both rooms still exist and their `owner` is the root admin

### Requirement: Field projection of room responses
Every room the server returns from `createRoom`, `getRoom`, `getRooms`, `updateRoomStatus`, `deleteRoom` and `bulkDeleteRooms` SHALL leave out the extra fields `config` and `roles` unless requested, SHALL contain only the fields named in `fields` (or the `X-Fields` header) when given, plus the extra fields named in `extraFields` (or `X-ExtraFields`), and SHALL list the available extra fields in `_extraFields`. Query and header values SHALL combine, and unknown names SHALL be ignored.

#### Scenario: Default projection
- **WHEN** `getRoom` is called without projection parameters
- **THEN** the room carries every base field but neither `config` nor `roles`
- **AND** `_extraFields` lists `config` and `roles`

#### Scenario: Selected fields plus an extra field
- **WHEN** `getRoom` is called with `fields=roomId,roomName` and the header `X-ExtraFields: config`
- **THEN** the room carries only `roomId`, `roomName` and `config`

#### Scenario: Header and query combine
- **WHEN** `getRooms` is called with `fields=roomId` and the header `X-Fields: roomName`
- **THEN** each listed room carries `roomId` and `roomName`

#### Scenario: Unknown names
- **WHEN** `getRooms` is called with `extraFields=foo`
- **THEN** the server answers `200` and the rooms carry neither `config` nor `roles`

### Requirement: Reading a room
The server SHALL return a room on `getRoom` to an API key, to a room member token issued for that same room, and to a logged-in user allowed into the room (see `room-access`), and SHALL answer `403` to any other caller.

#### Scenario: Owner reads their room
- **GIVEN** a `room_manager` user owns a room
- **WHEN** they call `getRoom` for it
- **THEN** the server answers `200` with the room

#### Scenario: Room member token of another room
- **GIVEN** a room member token issued for room A
- **WHEN** it is used to call `getRoom` for room B
- **THEN** the server answers `403`

### Requirement: Room list visibility
The server SHALL answer `getRooms` for an API key and for users of every role. An API key and an `admin` user SHALL see every room. When no scope filter is given, a `room_manager` user SHALL see the rooms they own, are a member of or that have user access enabled, and a `room_member` user the rooms they are a member of or that have user access enabled. A non-admin user filtering by `owner` or `member` with another user's id SHALL get `403`.

#### Scenario: Administrator sees every room
- **GIVEN** rooms owned by several users
- **WHEN** an `admin` user calls `getRooms`
- **THEN** every room is listed

#### Scenario: Room manager default scope
- **GIVEN** a `room_manager` user owns room A, is a member of room B, room C has user access enabled and room D has none of these
- **WHEN** they call `getRooms` without scope filters
- **THEN** rooms A, B and C are listed and room D is not

#### Scenario: Filtering by another user
- **GIVEN** a `room_member` user is logged in
- **WHEN** they call `getRooms` with `member` set to another user's id
- **THEN** the server answers `403`

### Requirement: Room list filters
`getRooms` SHALL combine the scope filters `owner`, `member` and `userAccess` with OR, and SHALL narrow the result with `status` and with `roomName`, matched according to `roomNameMatchMode` (`exact` by default, `prefix`, `partial` or `regex`) and `roomNameCaseInsensitive` (`false` by default). A regular expression that does not compile, is longer than 100 characters or uses a quantifier above 65535 SHALL be answered with `422`.

#### Scenario: Prefix match
- **GIVEN** rooms named `team-alpha`, `team-beta` and `sales`
- **WHEN** `getRooms` is called with `roomName=team` and `roomNameMatchMode=prefix`
- **THEN** only `team-alpha` and `team-beta` are listed

#### Scenario: Scope filters are a union
- **WHEN** an `admin` user calls `getRooms` with `owner` set to a user id and `userAccess=true`
- **THEN** the list holds the rooms owned by that user and the rooms with user access enabled

#### Scenario: Status filter
- **WHEN** `getRooms` is called with `status=closed`
- **THEN** only closed rooms are listed

#### Scenario: Invalid regular expression
- **WHEN** `getRooms` is called with `roomNameMatchMode=regex` and `roomName=a{1000000}`
- **THEN** the server answers `422` naming `roomName`

### Requirement: Room list pagination and sorting
`getRooms` SHALL return pages of at most `maxItems` rooms (10 by default, capped to 100, rounded down, echoed in `pagination.maxItems`) with `pagination.isTruncated` and a `nextPageToken` that resumes the listing, sorted by `sortField` (`creationDate` by default, `roomName` or `autoDeletionDate`) in `sortOrder` (`desc` by default). A zero, negative or non-numeric `maxItems` SHALL get `422`, and a `nextPageToken` the server did not issue `400`.

#### Scenario: Paging through rooms
- **GIVEN** three rooms exist
- **WHEN** `getRooms` is called with `maxItems=2` and then with the returned `nextPageToken`
- **THEN** the first page holds two rooms with `isTruncated` `true`
- **AND** the second page holds the remaining room with `isTruncated` `false`

#### Scenario: maxItems above the cap
- **WHEN** `getRooms` is called with `maxItems=101`
- **THEN** the server answers `200` and `pagination.maxItems` is `100`

#### Scenario: Forged page token
- **WHEN** `getRooms` is called with a `nextPageToken` the server did not issue
- **THEN** the server answers `400`

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
- **THEN** the room, its members and its recordings are deleted and `getRoom` answers `404`

### Requirement: Opening and closing a room
On `updateRoomStatus` the server SHALL set a room without an active meeting to `open` or `closed` and answer `200`. Closing a room whose meeting is active SHALL answer `202` with the room still `active_meeting` and `meetingEndAction` `close`, leave the meeting running and close the room when it ends. Any other status SHALL get `422`. A closed room SHALL accept no new meeting (see `meeting-join` and `meetings`) and keep its recordings and members.

#### Scenario: Close an idle room
- **GIVEN** an open room without an active meeting
- **WHEN** its owner calls `updateRoomStatus` with `closed`
- **THEN** the server answers `200` and the room is `closed`
- **AND** a participant asking to join its meeting afterwards is refused with `409`
- **AND** the room's recordings can still be listed and played

#### Scenario: Reopen a closed room
- **GIVEN** a closed room
- **WHEN** an admin calls `updateRoomStatus` with `open`
- **THEN** the server answers `200` and the room is `open`

#### Scenario: Requesting active_meeting
- **WHEN** `updateRoomStatus` is called with `active_meeting`
- **THEN** the server answers `422`

#### Scenario: Close scheduled for the end of the meeting
- **GIVEN** a room with an active meeting
- **WHEN** its owner calls `updateRoomStatus` with `closed`
- **THEN** the server answers `202` with `status` `active_meeting` and `meetingEndAction` `close`
- **AND** once the meeting ends the room is `closed` with `meetingEndAction` `none`

### Requirement: Room management authorization
The server SHALL allow `updateRoomStatus`, `deleteRoom`, `updateRoomConfig`, `updateRoomRoles` and `updateRoomAccess` only to an API key, to a user with the `admin` role, and to the room's owner, and SHALL answer `403` to any other user. A room member token SHALL never authorize them, whatever permissions it carries. Who may manage room members is specified in `room-members`.

#### Scenario: Room manager who does not own the room
- **GIVEN** a `room_manager` user who does not own room A
- **WHEN** they call `deleteRoom` for room A
- **THEN** the server answers `403` and the room is kept

#### Scenario: Room member token on a management operation
- **GIVEN** a request carrying only a room member token for room A with every permission
- **WHEN** it calls `updateRoomStatus` for room A
- **THEN** the server answers `401`

### Requirement: Deleting an idle room
On `deleteRoom` for a room with no active meeting and no recordings, the server SHALL delete the room and its members and answer `200` with `successCode` `room_deleted`. When several deletions of the same room run at once, on one replica or on several, exactly one SHALL succeed and the others SHALL answer `404`, never `500`.

#### Scenario: Plain deletion
- **GIVEN** a room with no active meeting and no recordings
- **WHEN** its owner calls `deleteRoom`
- **THEN** the server answers `200` with `successCode` `room_deleted`
- **AND** `getRoom` for it answers `404`

#### Scenario: Two replicas delete the same room
- **GIVEN** two Meet replicas sharing the same database
- **WHEN** each receives `deleteRoom` for the same idle room at the same time
- **THEN** one answers `200` with `room_deleted` and the other answers `404`

### Requirement: Deletion policy for an active meeting
`deleteRoom` on a room with an active meeting and no recordings SHALL follow `withMeeting`: `fail` (the default) answers `409` with error `room_has_active_meeting`; `force` ends the meeting for everyone, deletes the room once that end is processed and answers `200` with `room_with_active_meeting_deleted`; `when_meeting_ends` answers `202` with `room_with_active_meeting_scheduled_to_be_deleted` and the room with `meetingEndAction` `delete`.

#### Scenario: Default policy refuses
- **GIVEN** a room with an active meeting and no recordings
- **WHEN** `deleteRoom` is called without policies
- **THEN** the server answers `409` with error `room_has_active_meeting` and the meeting goes on

#### Scenario: Forced deletion
- **GIVEN** a room with an active meeting and no recordings
- **WHEN** `deleteRoom` is called with `withMeeting=force`
- **THEN** the server answers `200` with `successCode` `room_with_active_meeting_deleted`
- **AND** the meeting ends for every participant and the room is then deleted

#### Scenario: Deletion when the meeting ends
- **GIVEN** a room with an active meeting and no recordings
- **WHEN** `deleteRoom` is called with `withMeeting=when_meeting_ends`
- **THEN** the server answers `202` with the room in `active_meeting` and `meetingEndAction` `delete`
- **AND** the room is deleted when the meeting ends

### Requirement: Deletion policy for recordings
`deleteRoom` on a room with recordings and no active meeting SHALL follow `withRecordings`: `fail` (the default) answers `409` with error `room_has_recordings`; `force` deletes the room and its recordings and answers `200` with `room_and_recordings_deleted`; `close` keeps the room and its recordings, closes the room and answers `200` with `room_closed` and the room.

#### Scenario: Default policy refuses
- **GIVEN** a room with recordings and no active meeting
- **WHEN** `deleteRoom` is called without policies
- **THEN** the server answers `409` with error `room_has_recordings`

#### Scenario: Room and recordings deleted
- **WHEN** `deleteRoom` is called with `withRecordings=force` on that room
- **THEN** the server answers `200` with `successCode` `room_and_recordings_deleted` and the recordings are gone

#### Scenario: Room closed instead of deleted
- **WHEN** `deleteRoom` is called with `withRecordings=close` on that room
- **THEN** the server answers `200` with `successCode` `room_closed` and the room in status `closed`
- **AND** its recordings are kept

### Requirement: Deletion of a room with an active meeting and recordings
`deleteRoom` on a room with both an active meeting and recordings SHALL apply both policies together: it SHALL answer `409` and change nothing when either policy is `fail`, and otherwise SHALL end or wait for the meeting as `withMeeting` says and delete or close the room as `withRecordings` says, answering `200` when the meeting is forced and `202` when the outcome waits for the meeting to end. Each combination SHALL be named by its own success or error code.

#### Scenario: Meeting policy refuses
- **GIVEN** a room with an active meeting and recordings
- **WHEN** `deleteRoom` is called without `withMeeting`
- **THEN** the server answers `409` with error `room_with_recordings_has_active_meeting`

#### Scenario: Meeting forced, recordings deleted
- **WHEN** `deleteRoom` is called on that room with `withMeeting=force` and `withRecordings=force`
- **THEN** the server answers `200` with `successCode` `room_with_active_meeting_and_recordings_deleted`
- **AND** the meeting ends and the room and its recordings are deleted

#### Scenario: Meeting forced, recordings kept
- **WHEN** `deleteRoom` is called on that room with `withMeeting=force` and `withRecordings=close`
- **THEN** the server answers `200` with `successCode` `room_with_active_meeting_closed`
- **AND** the meeting ends and the room is closed with its recordings kept

#### Scenario: Meeting forced, recordings policy refuses
- **WHEN** `deleteRoom` is called on that room with `withMeeting=force` and no `withRecordings`
- **THEN** the server answers `409` with error `room_with_active_meeting_has_recordings` and the meeting goes on

#### Scenario: Scheduled deletion of room and recordings
- **WHEN** `deleteRoom` is called on that room with `withMeeting=when_meeting_ends` and `withRecordings=force`
- **THEN** the server answers `202` with `successCode` `room_with_active_meeting_and_recordings_scheduled_to_be_deleted`
- **AND** the room and its recordings are deleted when the meeting ends

#### Scenario: Scheduled close
- **WHEN** `deleteRoom` is called on that room with `withMeeting=when_meeting_ends` and `withRecordings=close`
- **THEN** the server answers `202` with `successCode` `room_with_active_meeting_scheduled_to_be_closed`
- **AND** the room is closed with its recordings kept when the meeting ends

#### Scenario: Recordings policy refuses a scheduled deletion
- **WHEN** `deleteRoom` is called on that room with `withMeeting=when_meeting_ends` and no `withRecordings`
- **THEN** the server answers `409` with error `room_with_active_meeting_has_recordings_cannot_schedule_deletion`

### Requirement: Bulk deletion of rooms
On `bulkDeleteRooms` the server SHALL accept up to 100 comma-separated `roomIds`, cleaned like path identifiers and deduplicated, apply `withMeeting` and `withRecordings` to each room as `deleteRoom` does, and answer `200` when every room was processed or `400` listing both the processed rooms in `deleted` and the others in `failed`. A room that does not exist or that the caller cannot manage SHALL only add an entry to `failed`. No usable id, or more than 100, SHALL be answered with `422`.

#### Scenario: Every room processed
- **GIVEN** two idle rooms owned by the caller
- **WHEN** they call `bulkDeleteRooms` with both ids
- **THEN** the server answers `200`, `failed` is empty and both rooms are deleted

#### Scenario: Partial failure
- **GIVEN** an idle room A and a room B with an active meeting, both owned by the caller
- **WHEN** they call `bulkDeleteRooms` with both ids and no policies
- **THEN** the server answers `400`, room A is listed in `deleted` and deleted
- **AND** room B is listed in `failed` with error `room_has_active_meeting`

#### Scenario: Room the caller cannot manage
- **GIVEN** a `room_manager` user who owns room A but not room B
- **WHEN** they call `bulkDeleteRooms` with both ids
- **THEN** room A is deleted and room B is listed in `failed` and kept

#### Scenario: Too many ids
- **WHEN** `bulkDeleteRooms` is called with 101 room ids
- **THEN** the server answers `422` and no room is deleted

### Requirement: Auto-deletion date and policy
`createRoom` SHALL accept an optional `autoDeletionDate` that is at least one hour in the future and no later than 8640000000000000, and an `autoDeletionPolicy` whose `withMeeting` is `force` or `when_meeting_ends` (the default) and whose `withRecordings` is `force` or `close` (the default). The value `fail` in either policy and an out-of-range date SHALL be answered with `422`. A policy sent without a date SHALL be discarded.

#### Scenario: Date and default policy
- **WHEN** `createRoom` is called with an `autoDeletionDate` two hours ahead and no policy
- **THEN** the room's `autoDeletionPolicy` is `withMeeting` `when_meeting_ends` and `withRecordings` `close`

#### Scenario: Date too close
- **WHEN** `createRoom` is called with an `autoDeletionDate` 30 minutes ahead
- **THEN** the server answers `422`

#### Scenario: Fail policy rejected
- **WHEN** `createRoom` is called with `autoDeletionPolicy.withRecordings` `fail`
- **THEN** the server answers `422`

#### Scenario: Policy without a date
- **WHEN** `createRoom` is called with an `autoDeletionPolicy` and no `autoDeletionDate`
- **THEN** the created room has neither `autoDeletionDate` nor `autoDeletionPolicy`

### Requirement: Automatic deletion of expired rooms
Within one hour after a room's `autoDeletionDate` has passed, Meet SHALL process the room exactly as a `deleteRoom` with the room's `autoDeletionPolicy`, and SHALL do so once for the whole cluster whatever the number of replicas. Until it is processed, the room SHALL keep working as before, new participants included. Rooms without a date, or with a date still ahead, SHALL be left untouched.

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

### Requirement: Properties fixed at creation
The server SHALL offer no operation that changes a room's `roomName`, `autoDeletionDate` or `autoDeletionPolicy` after creation; changing them requires creating a new room.

#### Scenario: Editing an existing room
- **GIVEN** an existing room
- **WHEN** its owner edits it in the console room wizard
- **THEN** the name and auto-deletion settings are shown read-only and only the config, access and role permissions can be saved

### Requirement: Console rooms list
The console SHALL offer the Rooms page to users of every role, listing the rooms the server returns for them with name, owner, status, pending end action, creation date and auto-deletion state, with search by name (prefix by default, with case and match-mode options) and filters by status and scope: owner, member and user access for admins; "created by me" (room managers only), "I'm a member of" and "open to all users" for the rest.

#### Scenario: Room member user opens the page
- **GIVEN** a `room_member` user is logged in
- **WHEN** they open the Rooms page
- **THEN** they see the rooms they are a member of and the rooms open to all users
- **AND** no create button is offered

#### Scenario: Status filter
- **GIVEN** an admin on the Rooms page
- **WHEN** they filter by the `closed` status
- **THEN** only closed rooms are listed

### Requirement: Console room actions
The console SHALL offer on each room an access action that opens the room's user access link in a new tab, and SHALL disable it and the share action for closed rooms. Edit, close or reopen, delete and bulk selection SHALL be offered only for rooms the user manages (admin or owner), with edit disabled while a meeting is active; other users SHALL see the share action only when the server returned the room's anonymous links (see `room-access`).

#### Scenario: Manager sees management actions
- **GIVEN** a `room_manager` user listing a room they own and a room they are only a member of
- **WHEN** they look at the actions of each room
- **THEN** the owned room offers edit, close, delete and selection for bulk deletion
- **AND** the other room offers only access and, if its links were returned, share

#### Scenario: Room with an active meeting
- **GIVEN** an admin listing a room with an active meeting
- **WHEN** they look at its actions
- **THEN** edit is disabled

#### Scenario: Closed room
- **GIVEN** a closed room in the list
- **WHEN** a user looks at its actions
- **THEN** access and share are disabled and the toggle offers to reopen it

### Requirement: Console room deletion
The console SHALL ask for confirmation and then delete with both policies set to `fail`. When the server answers with a deletion conflict (an active meeting or recordings), the console SHALL offer a dialog to choose the meeting and recordings policies and retry with them; in a bulk deletion, the retry SHALL cover only the rooms that failed.

#### Scenario: Deleting a room with recordings
- **GIVEN** a room with recordings
- **WHEN** its owner deletes it from the Rooms page and confirms
- **THEN** a dialog explains the room has recordings and offers the policies
- **AND** choosing to close the room keeps it in the list as closed

### Requirement: Console room wizard
The console SHALL let `admin` and `room_manager` users create a room either by name only or through a wizard with the steps Room Details, Meeting, Recording and Room Access, and SHALL take the user into the new room's join screen once it is created. A failed creation SHALL keep the wizard and its input and show the server's message. Every wizard session SHALL start from the defaults, never from an abandoned one.

#### Scenario: Basic creation
- **GIVEN** a `room_manager` user on the Rooms page
- **WHEN** they create a room giving only its name
- **THEN** the room is created with the default settings and the browser opens the room's join screen

#### Scenario: Failed creation keeps the input
- **GIVEN** a user filling the advanced wizard
- **WHEN** the server rejects the creation
- **THEN** the wizard stays open with every value as entered and shows the server's message

#### Scenario: Members added in the wizard
- **GIVEN** a user who added room members in the Room Access step
- **WHEN** the room is created and one member cannot be added
- **THEN** the room is created and a warning names the members that failed (see `room-members`)

### Requirement: Editing a room in the wizard
The console SHALL open the wizard in edit mode only for an admin or the room's owner and only while the room has no active meeting, redirecting anyone else to the Rooms page. Edit mode SHALL open on the Meeting step and save the config, the access settings and the role permissions, then return to the room detail page; when a save fails, it SHALL show the server's message and reload the room detail page.

#### Scenario: Edit while a meeting is active
- **GIVEN** a room with an active meeting
- **WHEN** its owner opens the room's edit URL
- **THEN** the console redirects to the Rooms page

#### Scenario: Successful edit
- **GIVEN** an idle room
- **WHEN** its owner turns chat off in the wizard and saves
- **THEN** the room detail page opens and the room's `chat.enabled` is `false`

### Requirement: Wizard validation
The wizard SHALL block finishing while the participant limit is outside 1 to 30, the duration limit outside 1 to 1440 minutes, the auto-deletion date less than an hour ahead, or the recording auto-start unreachable with the participant limit, flagging the Meeting and Recording steps in that last case, so that it never submits a combination the server rejects (see `room-config`).

#### Scenario: Unreachable auto-start
- **GIVEN** the wizard with participant limit 1
- **WHEN** the user picks the trigger "when the second participant joins"
- **THEN** the finish button is disabled and the Meeting and Recording steps show a warning

#### Scenario: Participant limit out of range
- **WHEN** the user types 31 as participant limit
- **THEN** the field shows an error with the accepted range and the finish button is disabled

### Requirement: Wizard dependent settings
The wizard SHALL keep end-to-end encryption and recording mutually exclusive, restoring the previous state of the other when one is turned off again, and SHALL disable the `mediaChangeVirtualBackground` role switches while virtual backgrounds are off, restoring them as left when virtual backgrounds are turned back on. The chat role switches are specified in `meeting-chat`.

#### Scenario: Enabling end-to-end encryption
- **GIVEN** the wizard with recording allowed
- **WHEN** the user turns end-to-end encryption on and later off again
- **THEN** recording is turned off while encryption is on and allowed again afterwards

#### Scenario: Virtual backgrounds turned off
- **GIVEN** the wizard with virtual backgrounds turned off in the Meeting step
- **WHEN** the user opens the Room Access step
- **THEN** the `mediaChangeVirtualBackground` switches of both roles are disabled while the chat ones stay enabled

### Requirement: Console room detail page
The console SHALL open a room's detail page only for a user the server lets read the room, redirecting anyone else to the Rooms page. The page SHALL show the room id (copyable), owner, creation date, auto-deletion state and status with the same actions as the list, a Recordings tab that lists the room's recordings only when the user holds `recordingList` in the room (see `recordings`), and a Room Members tab only for users who manage the room (see `room-members`).

#### Scenario: Member without recording access
- **GIVEN** a `room_member` user who is a member of a room without `recordingList`
- **WHEN** they open the room's detail page
- **THEN** the Recordings tab says they have no access to the recordings instead of listing them
- **AND** no Room Members tab is shown

#### Scenario: Room not readable
- **GIVEN** a `room_member` user who has no access to a room
- **WHEN** they open that room's detail URL
- **THEN** the console redirects to the Rooms page
