## ADDED Requirements

### Requirement: Credentials of a realtime connection
A realtime connection (see `deployment`) SHALL open only with a room member token carrying a participant identity, in the `roomMemberToken` query parameter or the `X-Room-Member-Token` header, validated as on any request. Otherwise the server SHALL close it before sending any message: as unauthorized for a missing or invalid token, as forbidden for one without identity. The page's origin SHALL NOT matter, since Meet uses no cookies.

#### Scenario: Connection without a token
- **WHEN** a client opens a realtime connection with no credential
- **THEN** the server closes it as unauthorized without sending any message

#### Scenario: Token that joins no meeting
- **GIVEN** a valid room member token issued without a participant identity
- **WHEN** a client opens a realtime connection with it
- **THEN** the server closes it as forbidden without sending any message

#### Scenario: Token in the query parameter
- **GIVEN** a valid room member token with a participant identity
- **WHEN** a browser opens a realtime connection with `?roomMemberToken=<token>`
- **THEN** the connection stays open for that room and identity

#### Scenario: Token invalidated by a room change
- **GIVEN** a room member token issued before the room's roles were updated
- **WHEN** a client opens a realtime connection with it
- **THEN** the server closes it as unauthorized

### Requirement: A realtime connection ends with its token
The server SHALL close an open realtime connection as unauthorized when its token expires, and the client reconnects with a renewed token. A token invalidated after the connection opened SHALL take effect when the client next connects or uses the token on a request.

#### Scenario: Token expires while connected
- **GIVEN** an open realtime connection
- **WHEN** the token that opened it expires
- **THEN** the server closes the connection as unauthorized
