## ADDED Requirements

### Requirement: Token revocation check never waits indefinitely
The server SHALL answer a request authenticated with a user access token, and `logoutUser`, within about two seconds while Redis is unreachable, instead of waiting for Redis to return: `503`, since a token that cannot be checked is never accepted. Requests that need no revocation check, such as those authenticated with the API key, SHALL be unaffected.

#### Scenario: Redis unreachable
- **GIVEN** Redis stops answering while Meet runs
- **WHEN** a client calls `getMe` with a user access token
- **THEN** the server answers `503` within about two seconds

#### Scenario: Logout during the outage
- **GIVEN** Redis stops answering while Meet runs
- **WHEN** a client calls `logoutUser`
- **THEN** the server answers `503` within about two seconds, since the end of the session could not be recorded

#### Scenario: Token refresh during the outage
- **GIVEN** Redis stops answering while a user is signed in to the console
- **WHEN** the console refreshes the access token and the server answers `503`
- **THEN** the user stays signed in and the original request fails without ending the session

#### Scenario: API key during the outage
- **GIVEN** Redis stops answering while Meet runs
- **WHEN** a backend calls `getUsers` with the API key
- **THEN** the server answers `200`

#### Scenario: Redis returns
- **GIVEN** requests that were answered during a Redis outage
- **WHEN** Redis answers again
- **THEN** a user access token is checked against the revocations as usual
