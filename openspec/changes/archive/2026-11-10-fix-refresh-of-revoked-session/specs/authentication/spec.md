## MODIFIED Requirements

### Requirement: Room changes invalidate room member tokens
The server SHALL reject with `401` a room member token issued before the room's roles or access were last updated (`updateRoomRoles`, `updateRoomAccess`) or after the room was deleted, whoever it was issued to. Presenting such a token as the previous token SHALL NOT renew a session that connected to the meeting with it: the token request SHALL answer `401`. A change of the room `config` leaves room member tokens valid.

#### Scenario: Room roles updated
- **GIVEN** an anonymous moderator's room member token for a room
- **WHEN** a manager of the room calls `updateRoomRoles`
- **AND** the participant calls `getRoom` with that token
- **THEN** the server answers `401` with message `Invalid token`

#### Scenario: Room access updated
- **GIVEN** a room member token for a room
- **WHEN** a manager of the room calls `updateRoomAccess`
- **AND** the holder calls `getRoomConfig` with that token
- **THEN** the server answers `401` with message `Invalid token`

#### Scenario: Room config updated
- **GIVEN** a room member token for a room
- **WHEN** a manager of the room calls `updateRoomConfig` to disable chat
- **THEN** the token is still accepted

#### Scenario: Renewing a token issued before a room change
- **GIVEN** a speaker's join token and a manager who updates the room's roles between meetings
- **WHEN** the speaker connects to the next meeting with that token and asks for a fresh token with it before Meet removes the connection
- **THEN** the server answers `401` and the connection is removed
