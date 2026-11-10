## ADDED Requirements

### Requirement: Credentials of a realtime connection
A realtime connection (see `deployment`) SHALL open only with a credential that a feature using the channel accepts, given in the query of the connection; the waiting room's is its waiting ticket (see `waiting-room`). The server SHALL refuse the connection before it opens when the query carries no such credential, and SHALL close it before sending any message, as forbidden, when the feature does not know the credential.

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
