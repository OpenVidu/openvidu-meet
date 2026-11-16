## MODIFIED Requirements

### Requirement: Room changes invalidate room member tokens

The server SHALL reject with `401` a room member token issued before the room's roles or access were last updated (`updateRoomRoles`, `updateRoomAccess`, locking the room included, see `locked-room`), or after the room was deleted, whoever it was issued to. Presenting such a token as the previous token SHALL NOT renew a session that connected with it: the token request SHALL answer `401`. Any other change of the room `config` leaves room member tokens valid.

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

#### Scenario: Waiting room turned on

- **GIVEN** a room member token for an unlocked room
- **WHEN** a manager of the room calls `updateRoomAccess` with `access.lock.enabled` true
- **AND** the holder calls `getRoom` with that token
- **THEN** the server answers `401` with message `Invalid token`

#### Scenario: Waiting room message changed

- **GIVEN** a room member token for a locked room
- **WHEN** a manager calls `updateRoomAccess` changing only `access.lock.message`
- **THEN** the token is rejected like after any other access update

### Requirement: Credentials of a realtime connection

A realtime connection (see `deployment`) SHALL open only with a credential that a feature using the channel accepts, given in the query of the connection; the locked room's is the waiting ticket (see `locked-room`). The server SHALL refuse the connection before it opens when the query carries no such credential, and SHALL close it before sending any message, as forbidden, when the feature does not know the credential.

#### Scenario: Connection without a credential

- **WHEN** a client opens a realtime connection with no credential
- **THEN** the server refuses it before it opens

#### Scenario: Unknown credential

- **GIVEN** a credential parameter a feature registered, with a value it does not know
- **WHEN** a client opens a realtime connection with it
- **THEN** the server closes it as forbidden without sending any message
- **AND** the client does not reconnect

#### Scenario: Known credential

- **GIVEN** a credential a feature knows, for a room
- **WHEN** a browser opens a realtime connection with it
- **THEN** the connection stays open, addressed as that feature decides
