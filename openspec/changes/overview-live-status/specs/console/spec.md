## MODIFIED Requirements

### Requirement: Overview with usage figures
The overview SHALL show, from `getAnalytics`, the number of rooms split into open, in a meeting now and closed, and the number of recordings with how many are available for playback and how many are in progress now, with actions to create a room, list all rooms and list all recordings.

#### Scenario: Deployment in use
- **GIVEN** three rooms, one open, one with an active meeting and one closed, and two complete recordings, one more recording being in progress
- **WHEN** an admin opens the overview
- **THEN** it shows 3 rooms with 1 open, 1 in a meeting now and 1 closed
- **AND** it shows 3 recordings with 2 available for playback and 1 in progress

#### Scenario: Nothing running
- **GIVEN** rooms and recordings, none of them in a meeting or in progress
- **WHEN** an admin opens the overview
- **THEN** it shows that no recording is in progress and 0 rooms in a meeting now

### Requirement: Usage analytics endpoint
`getAnalytics` (`GET /internal-api/v1/analytics`) SHALL answer only an access token of a user with role `admin`. A user with another role SHALL get `403`; an API key or no credential SHALL get `401`.

#### Scenario: Admin reads analytics
- **WHEN** an admin calls `getAnalytics` with their access token
- **THEN** the server answers `200` with `totalRooms`, `activeRooms`, `openRooms`, `closedRooms`, `totalRecordings`, `completeRecordings`, `recordingsInProgress` and `roomsExpiringSoon`, and with `nextExpiringRoom` when a room is expiring soon

#### Scenario: API key is not accepted
- **WHEN** a client calls `getAnalytics` with the API key
- **THEN** the server answers `401`

#### Scenario: Room manager is refused
- **WHEN** a `room_manager` calls `getAnalytics`
- **THEN** the server answers `403`

### Requirement: Analytics count the current state
`getAnalytics` SHALL count the rooms that exist (`totalRooms`) and, of them, those open (`openRooms`), whose meeting is active (`activeRooms`) and closed (`closedRooms`); and the recordings that exist (`totalRecordings`), those whose status is `complete` (`completeRecordings`) and those in progress, `starting`, `active` or `ending` (`recordingsInProgress`). Deleted rooms and recordings SHALL not be counted.

#### Scenario: Room deleted
- **GIVEN** `getAnalytics` reports 3 rooms
- **WHEN** one room is deleted
- **THEN** `getAnalytics` reports 2 rooms

#### Scenario: Recording still in progress
- **GIVEN** one complete recording and one recording that is still active
- **WHEN** an admin calls `getAnalytics`
- **THEN** `totalRecordings` is 2, `completeRecordings` is 1 and `recordingsInProgress` is 1

#### Scenario: Rooms by status
- **GIVEN** one open room, one room with an active meeting and two closed rooms
- **WHEN** an admin calls `getAnalytics`
- **THEN** `totalRooms` is 4, `openRooms` is 1, `activeRooms` is 1 and `closedRooms` is 2

#### Scenario: Recording that is not in progress
- **GIVEN** a recording that is `complete`, one that `failed` and one that was `aborted`
- **WHEN** an admin calls `getAnalytics`
- **THEN** `recordingsInProgress` is 0

## ADDED Requirements

### Requirement: Overview shows the rooms expiring soon
The overview SHALL show how many rooms reach their `autoDeletionDate` within the next 7 days and, for the one that reaches it first, its name linking to its detail page, or a message that no room is scheduled when none does.

#### Scenario: Rooms expiring
- **GIVEN** three rooms with an `autoDeletionDate` within the next 7 days, the earliest in two days
- **WHEN** an admin opens the overview
- **THEN** it shows 3 rooms expiring soon and the name of the room that expires in two days
- **AND** opening that name shows the room's detail page

#### Scenario: No room expiring
- **GIVEN** rooms with no `autoDeletionDate`, or with one more than 7 days ahead
- **WHEN** an admin opens the overview
- **THEN** it shows 0 rooms expiring soon and that no room is scheduled for automatic deletion

### Requirement: Analytics report the rooms about to expire
`getAnalytics` SHALL report in `roomsExpiringSoon` the rooms whose `autoDeletionDate` falls between now and 7 days ahead, and in `nextExpiringRoom` the `roomId`, `roomName` and `autoDeletionDate` of the one with the earliest date, leaving it out when there is none. Rooms without a date, with a later one, or with a date already passed SHALL not be counted.

#### Scenario: Rooms within the window
- **GIVEN** a room expiring in two days, a room expiring in six days and a room expiring in ten days
- **WHEN** an admin calls `getAnalytics`
- **THEN** `roomsExpiringSoon` is 2 and `nextExpiringRoom` is the room expiring in two days

#### Scenario: Date already passed
- **GIVEN** a closed room with recordings whose `autoDeletionDate` passed yesterday, kept by the default policy
- **WHEN** an admin calls `getAnalytics`
- **THEN** `roomsExpiringSoon` is 0 and `nextExpiringRoom` is absent
