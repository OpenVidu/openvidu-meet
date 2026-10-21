## MODIFIED Requirements

### Requirement: Refresh the access token
The server SHALL exchange a valid refresh token sent to `refreshAccessToken` for a new `accessToken`, and SHALL also return a new `refreshToken` when `MEET_REFRESH_TOKEN_ROTATION_ENABLED` is `true` (the default). With rotation, each refresh token is accepted once: presenting it again answers `400` with message `Invalid refresh token`, on every replica.

#### Scenario: Refresh with rotation
- **GIVEN** a valid refresh token and default configuration
- **WHEN** the client calls `refreshAccessToken` with `X-Refresh-Token: Bearer <token>`
- **THEN** the server answers `200` with a new `accessToken` and a new `refreshToken`

#### Scenario: Refresh without rotation
- **GIVEN** `MEET_REFRESH_TOKEN_ROTATION_ENABLED` set to `false`
- **WHEN** the client refreshes
- **THEN** the response carries an `accessToken` and no `refreshToken`

#### Scenario: Rotated refresh token presented again
- **GIVEN** default configuration and a refresh token already exchanged through `refreshAccessToken`
- **WHEN** a client calls `refreshAccessToken` with that same refresh token
- **THEN** the server answers `400` with message `Invalid refresh token`
- **AND** the tokens the first exchange returned stay valid

#### Scenario: Same refresh token on two replicas at once
- **GIVEN** two Meet replicas, default configuration and one refresh token
- **WHEN** each replica receives `refreshAccessToken` with that refresh token at the same time
- **THEN** one answers `200` with new tokens and the other `400` with message `Invalid refresh token`

#### Scenario: Refresh without rotation reuses the token
- **GIVEN** `MEET_REFRESH_TOKEN_ROTATION_ENABLED` set to `false` and a refresh token already exchanged once
- **WHEN** the client refreshes with it again before it expires
- **THEN** the server answers `200` with a new `accessToken`

### Requirement: Logout
The server SHALL answer `logoutUser` with `200` whether or not the request carries credentials. When it carries a valid access token or refresh token, the server SHALL end that login session on every replica: every access token and refresh token of the session is rejected from then on, while the user's other sessions stay valid. A login session is the tokens one `loginUser` or `changeUserPassword` returns plus every token later obtained from them through `refreshAccessToken`.

#### Scenario: Logout without credentials
- **WHEN** a client calls `logoutUser` with no credential
- **THEN** the server answers `200` with message `Logout successful`

#### Scenario: Logout ends the session
- **GIVEN** a user logged in from two browsers
- **WHEN** the first browser calls `logoutUser` with its access token
- **THEN** that access token answers `401` with message `Invalid token` on `getMe`
- **AND** that browser's refresh token answers `400` with message `Invalid refresh token` on `refreshAccessToken`
- **AND** the second browser's tokens are still accepted

#### Scenario: Logout on another replica
- **GIVEN** two Meet replicas and a logged-in user
- **WHEN** the user calls `logoutUser` through the first replica
- **AND** presents the same access token to the second replica
- **THEN** the second replica answers `401` with message `Invalid token`

### Requirement: Console session renewal
The console SHALL keep its tokens in browser storage, and when a request answers `401` it SHALL refresh the access token and retry the request without the user noticing. When the refresh fails, or a request answers `403` because a password change is required, the console SHALL log the user out to the login page, keeping the page they were on as the destination.

#### Scenario: Access token expired
- **GIVEN** a signed-in user whose access token expired but whose refresh token is valid
- **WHEN** they act on a console page
- **THEN** the action completes without returning to the login page

#### Scenario: Every token expired
- **GIVEN** a signed-in user whose access and refresh tokens both expired
- **WHEN** they act on a console page
- **THEN** the console shows the login page and returns to that page after login

#### Scenario: Several requests expire together
- **GIVEN** a signed-in user whose access token expired, with default refresh token rotation
- **WHEN** a console page sends several requests that all answer `401`
- **THEN** the console refreshes once, retries every request with the new access token and the user stays signed in

#### Scenario: Two console tabs renew at once
- **GIVEN** a user signed in to the console in two tabs of the same browser, with default refresh token rotation
- **WHEN** both tabs find the access token expired at the same moment
- **THEN** both tabs keep working without returning to the login page
