## ADDED Requirements

### Requirement: Console rooms figures

The console Rooms page SHALL show, as the key figures of a console list (see `console`), the rooms the user can see in total, in a meeting now, open and closed, each of the last three filtering the list by that status, and the number of them whose `autoDeletionDate` falls within the next 7 days with the name of the one that comes first, linking to its detail page, or 0 and no room name when none does. The expiring figure SHALL not filter.

#### Scenario: Administrator

- **GIVEN** 24 rooms, 3 with an active meeting, 15 open and 6 closed, two of them with an `autoDeletionDate` within 7 days, the earliest in two days
- **WHEN** an admin opens the Rooms page
- **THEN** the figures show 24 rooms, 3 in a meeting now, 15 open, 6 closed and 2 expiring in 7 days
- **AND** the expiring figure names the room that expires in two days and links to its detail page

#### Scenario: Expiring figure does not filter

- **WHEN** the user selects the expiring figure on the Rooms page
- **THEN** the list keeps its filters

### Requirement: Rooms summary endpoint

`roomGetSummary` (`GET /internal-api/v1/rooms/summary`) SHALL count the rooms `roomList` lists for the caller without scope filters (see "Room list visibility"), and SHALL answer an access token of a user of any role and `401` to an API key, a room member token or no credential.

#### Scenario: Room manager counts only the rooms they can see

- **GIVEN** a `room_manager` user who owns room A, is a member of room B, room C has user access enabled and room D has none of these, and all four are open
- **WHEN** the user calls `roomGetSummary`
- **THEN** it reports 3 rooms, 3 of them open

#### Scenario: API key is not accepted

- **WHEN** a client calls `roomGetSummary` with the API key
- **THEN** the server answers `401`

#### Scenario: Room member token is not accepted

- **WHEN** a client calls `roomGetSummary` with a room member token
- **THEN** the server answers `401`

#### Scenario: No credential

- **WHEN** a client calls `roomGetSummary` without credentials
- **THEN** the server answers `401`
