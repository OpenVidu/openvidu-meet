## MODIFIED Requirements

### Requirement: Change own password
The server SHALL let any logged-in user replace their password through `changeUserPassword` by giving the current one, answer `400` when the current password is wrong and `422` when the new one is shorter than 5 characters, and accept only the new password at later logins. A successful change SHALL answer `200` with a new `accessToken` and `refreshToken` and SHALL reject, on every replica, every access token and refresh token issued to the user before it.

#### Scenario: Password changed
- **GIVEN** a logged-in user without a pending password change
- **WHEN** they call `changeUserPassword` with their current password and a new valid one
- **THEN** the server answers `200` with an `accessToken` and a `refreshToken`
- **AND** logging in with the old password fails and with the new one succeeds

#### Scenario: Other sessions signed out
- **GIVEN** a user logged in from two browsers
- **WHEN** they change their password from the first one
- **THEN** the second browser's access token answers `401` with message `Invalid token`
- **AND** its refresh token answers `400` with message `Invalid refresh token`
- **AND** the tokens the change returned are accepted

#### Scenario: Change on another replica
- **GIVEN** two Meet replicas and a user logged in from two browsers
- **WHEN** the user changes their password through the first replica
- **AND** the second browser presents its earlier access token to the second replica
- **THEN** the second replica answers `401` with message `Invalid token`

#### Scenario: Wrong current password
- **WHEN** a user calls `changeUserPassword` with a wrong current password
- **THEN** the server answers `400` and the password is unchanged
