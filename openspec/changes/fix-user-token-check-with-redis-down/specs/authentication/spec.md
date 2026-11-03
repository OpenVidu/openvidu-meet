## ADDED Requirements

### Requirement: Token revocation check never waits indefinitely
The server SHALL answer a request authenticated with a user access token, and `logoutUser`, within about two seconds while Redis is unreachable, instead of waiting for Redis to return. Requests that need no revocation check, such as those authenticated with the API key, SHALL be unaffected.

#### Scenario: Redis unreachable
- **GIVEN** Redis stops answering while Meet runs
- **WHEN** a client calls `getMe` with a user access token
- **THEN** the server answers within about two seconds

#### Scenario: API key during the outage
- **GIVEN** Redis stops answering while Meet runs
- **WHEN** a backend calls `getUsers` with the API key
- **THEN** the server answers `200`

#### Scenario: Redis returns
- **GIVEN** requests that were answered during a Redis outage
- **WHEN** Redis answers again
- **THEN** a user access token is checked against the revocations as usual
