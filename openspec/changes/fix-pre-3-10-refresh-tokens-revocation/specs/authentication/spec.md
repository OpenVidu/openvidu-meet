## ADDED Requirements

### Requirement: Refresh tokens from before the upgrade are refused
With `MEET_REFRESH_TOKEN_ROTATION_ENABLED` set to `true`, the server SHALL answer `400` with message `Invalid refresh token` to a refresh token issued by a Meet version older than 3.10, which carries no rotation or session identity, so such a token can be neither exchanged repeatedly nor outlive `logoutUser`.

#### Scenario: Refresh token issued by 3.9
- **GIVEN** default configuration and a refresh token issued before the upgrade to 3.10
- **WHEN** the client calls `refreshAccessToken` with it
- **THEN** the server answers `400` with message `Invalid refresh token`
