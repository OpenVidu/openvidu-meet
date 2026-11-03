## MODIFIED Requirements

### Requirement: Reading one member
`getRoomMember` SHALL be allowed with an API key, to an admin, to the room's owner, to a `room_manager` reading their own membership, and with a room member token of that member. A token of another room SHALL get `403` whether or not the room exists; other callers SHALL get `404` for a missing room. Any other caller SHALL get `403` whether or not the member exists, and only a caller allowed to read it SHALL get `404` for a missing member.

#### Scenario: Own member through a room member token
- **GIVEN** an identified guest holding a room member token obtained with their personal link
- **WHEN** they call `getRoomMember` for their own `memberId`
- **THEN** the server answers `200` with their member

#### Scenario: Another member's data
- **GIVEN** a room member token obtained with the room's anonymous moderator link
- **WHEN** its holder calls `getRoomMember` for any member
- **THEN** the server answers `403`

#### Scenario: User with role room_member
- **GIVEN** a user with role `room_member` who is a member of the room
- **WHEN** they call `getRoomMember` for their own membership with their access token
- **THEN** the server answers `403`

#### Scenario: Unknown member
- **WHEN** a manager of the room calls `getRoomMember` for a `memberId` that is not a member of it
- **THEN** the server answers `404`

#### Scenario: Probing for members without access
- **GIVEN** a room member token obtained with the room's anonymous speaker link
- **WHEN** its holder calls `getRoomMember` for an existing `memberId` and for one that is not a member of the room
- **THEN** the server answers `403` to both

#### Scenario: Probing for rooms with another room's token
- **GIVEN** a room member token of room A
- **WHEN** its holder calls `getRoomMember` for room B, once with an existing room and once with a room that does not exist
- **THEN** the server answers `403` to both

#### Scenario: Unknown room for a manager
- **WHEN** a user with access to read members calls `getRoomMember` for a room that does not exist
- **THEN** the server answers `404`
