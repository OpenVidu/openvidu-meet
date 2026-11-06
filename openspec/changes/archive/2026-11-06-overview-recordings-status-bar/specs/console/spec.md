## MODIFIED Requirements

### Requirement: Overview with usage figures
The overview SHALL show, from `getAnalytics`, the number of rooms split into open, in a meeting now and closed, and the number of recordings split into available for playback, in progress now and failed, each split as a proportional bar with a legend carrying the counts, with actions to create a room, list all rooms and list all recordings.

#### Scenario: Deployment in use
- **GIVEN** three rooms, one open, one with an active meeting and one closed, and two complete recordings, one recording in progress and one that failed
- **WHEN** an admin opens the overview
- **THEN** it shows 3 rooms with 1 open, 1 in a meeting now and 1 closed
- **AND** it shows 4 recordings with 2 available for playback, 1 in progress and 1 failed

#### Scenario: Nothing running
- **GIVEN** rooms and recordings, none of them in a meeting or in progress
- **WHEN** an admin opens the overview
- **THEN** it shows 0 recordings in progress and 0 rooms in a meeting now

#### Scenario: Bar without a status
- **GIVEN** three complete recordings and none in progress or failed
- **WHEN** an admin opens the overview
- **THEN** the recordings bar is filled by the available segment alone
- **AND** the legend still lists in progress and failed with 0

### Requirement: Usage analytics endpoint
`getAnalytics` (`GET /internal-api/v1/analytics`) SHALL answer only an access token of a user with role `admin`. A user with another role SHALL get `403`; an API key or no credential SHALL get `401`.

#### Scenario: Admin reads analytics
- **WHEN** an admin calls `getAnalytics` with their access token
- **THEN** the server answers `200` with `totalRooms`, `activeRooms`, `openRooms`, `closedRooms`, `totalRecordings`, `completeRecordings`, `recordingsInProgress`, `failedRecordings` and `roomsExpiringSoon`, and with `nextExpiringRoom` when a room is expiring soon

#### Scenario: API key is not accepted
- **WHEN** a client calls `getAnalytics` with the API key
- **THEN** the server answers `401`

#### Scenario: Room manager is refused
- **WHEN** a `room_manager` calls `getAnalytics`
- **THEN** the server answers `403`

### Requirement: Analytics count the current state
`getAnalytics` SHALL count the rooms that exist (`totalRooms`) and, of them, those open (`openRooms`), with an active meeting (`activeRooms`) and closed (`closedRooms`); and the recordings that exist (`totalRecordings`) and, of them, those `complete` (`completeRecordings`), those `starting`, `active` or `ending` (`recordingsInProgress`) and those `failed`, `aborted` or `limit_reached` (`failedRecordings`). Deleted rooms and recordings SHALL not be counted.

#### Scenario: Room deleted
- **GIVEN** `getAnalytics` reports 3 rooms
- **WHEN** one room is deleted
- **THEN** `getAnalytics` reports 2 rooms

#### Scenario: Recording still in progress
- **GIVEN** one complete recording and one recording that is still active
- **WHEN** an admin calls `getAnalytics`
- **THEN** `totalRecordings` is 2, `completeRecordings` is 1, `recordingsInProgress` is 1 and `failedRecordings` is 0

#### Scenario: Rooms by status
- **GIVEN** one open room, one room with an active meeting and two closed rooms
- **WHEN** an admin calls `getAnalytics`
- **THEN** `totalRooms` is 4, `openRooms` is 1, `activeRooms` is 1 and `closedRooms` is 2

#### Scenario: Recording that is not in progress
- **GIVEN** a recording that is `complete`, one that `failed`, one that was `aborted` and one whose status is `limit_reached`
- **WHEN** an admin calls `getAnalytics`
- **THEN** `recordingsInProgress` is 0 and `failedRecordings` is 3
- **AND** `completeRecordings`, `recordingsInProgress` and `failedRecordings` add up to `totalRecordings`
