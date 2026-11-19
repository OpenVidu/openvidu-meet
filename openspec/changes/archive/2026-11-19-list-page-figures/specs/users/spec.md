## ADDED Requirements

### Requirement: Console users figures

The console Users page SHALL show, as the key figures of a console list (see `console`), the users in total and those with role `admin`, `room_manager` and `room_member`, each of the last three filtering the list by that role. The root admin and the signed-in user SHALL be counted like any other user.

#### Scenario: Users by role

- **GIVEN** 12 users: 2 `admin`, 4 `room_manager` and 6 `room_member`
- **WHEN** an admin opens the Users page
- **THEN** the figures show 12 users, 2 admins, 4 room managers and 6 room members

#### Scenario: Role figure filters the list

- **WHEN** the admin selects the room managers figure on the Users page
- **THEN** the list shows only `room_manager` users and the role filter of the page holds `room_manager`

### Requirement: Users summary endpoint

`userGetSummary` (`GET /internal-api/v1/users/summary`) SHALL count the users by role and SHALL answer only an access token of a user with role `admin`; a user with another role SHALL get `403`, and an API key or no credential `401`.

#### Scenario: Room manager is refused

- **WHEN** a `room_manager` calls `userGetSummary`
- **THEN** the server answers `403`

#### Scenario: API key is not accepted

- **WHEN** a client calls `userGetSummary` with the API key
- **THEN** the server answers `401`

#### Scenario: No credential

- **WHEN** a client calls `userGetSummary` without credentials
- **THEN** the server answers `401`
