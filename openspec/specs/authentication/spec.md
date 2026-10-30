# Authentication Specification

## Purpose

Authentication decides who is calling Meet: integrator backends with the API key, logged-in users with access tokens, and meeting participants with room member tokens. Every REST client, the console and the embedded element rely on it.

Surfaces: REST API security schemes (`apiKeyHeader`, `accessTokenHeader`, `refreshTokenHeader`, `roomMemberTokenHeader` in `meet-ce/backend/openapi/shared/security.yaml`), internal API `loginUser`, `logoutUser`, `refreshAccessToken` (`meet-ce/backend/openapi/auth/`) and `createApiKey`, `getApiKeys`, `deleteApiKeys` (`meet-ce/backend/openapi/api-keys/`), configuration (`MEET_INITIAL_API_KEY`, `MEET_ACCESS_TOKEN_EXPIRATION`, `MEET_REFRESH_TOKEN_EXPIRATION`, `MEET_REFRESH_TOKEN_ROTATION_ENABLED`, `MEET_PASSWORD_CHANGE_TOKEN_EXPIRATION`, `MEET_ROOM_MEMBER_TOKEN_EXPIRATION`), console (login page, session renewal, API key section of the Embedded page). Documented in openvidu.io `docs/meet/embedded/reference/rest-api.md` and `docs/meet/features/users/`. User accounts are specified in `users`; how room member tokens are issued, in `room-members`.

## Requirements

### Requirement: Credential kinds and headers
The server SHALL recognize four credentials, each in its own header: the API key as the bare value of `X-API-KEY`, the access token as `Authorization: Bearer <token>`, the refresh token as `X-Refresh-Token: Bearer <token>` and the room member token as `X-Room-Member-Token: Bearer <token>`. A token header without the `Bearer ` prefix counts as absent. Meet uses no cookies for authentication.

#### Scenario: Token header without prefix
- **GIVEN** a valid access token
- **WHEN** a client sends it as `Authorization: <token>` to an endpoint that requires a logged-in user, with no other credential
- **THEN** the server answers `401` with message `Unauthorized`

#### Scenario: API key with a prefix
- **GIVEN** a deployment with an API key
- **WHEN** a client sends `X-API-KEY: Bearer <key>` with that key
- **THEN** the server answers `401` with message `Invalid API key`

### Requirement: Tokens in query parameters
The server SHALL also accept the access token as the `accessToken` query parameter and the room member token as the `roomMemberToken` query parameter, both bare, wherever the matching header is accepted, so that requests a browser issues without custom headers (a `<video>` source) can authenticate. The refresh token travels only in its header.

#### Scenario: Room member token in the URL
- **GIVEN** a valid room member token for a room
- **WHEN** a client requests a resource of that room with `?roomMemberToken=<token>` and no header
- **THEN** the server authenticates the request as with the header

#### Scenario: Refresh token in the URL
- **WHEN** a client calls `refreshAccessToken` with the refresh token only as a query parameter
- **THEN** the server answers `400` with message `No refresh token provided`

### Requirement: Credentials accepted per endpoint
The server SHALL authenticate each endpoint only with the credentials its OpenAPI security lists, and answer `401` with message `Unauthorized` when the request carries none of them.

#### Scenario: No credentials
- **WHEN** a client calls `getUsers` without any credential
- **THEN** the server answers `401` with message `Unauthorized`

#### Scenario: API key on an endpoint that does not take it
- **WHEN** a client calls `getApiKeys` or `getMe` with only a valid API key
- **THEN** the server answers `401`

### Requirement: Credential precedence
When a request carries several accepted credentials, the server SHALL decide with the one of highest precedence (API key, then room member token, then access token): it accepts the request when that credential is valid and rejects it when that credential is invalid, whatever the others are. An invalid access token next to an accepted room member token is ignored.

#### Scenario: Invalid API key and valid access token
- **WHEN** a client calls `createUser` with an invalid API key and the access token of an `admin` user
- **THEN** the server answers `401` with message `Invalid API key`

#### Scenario: Valid room member token and invalid access token
- **WHEN** a client calls `getRoom` with a valid room member token for that room and an invalid access token
- **THEN** the server answers `200`

#### Scenario: Expired room member token and valid access token
- **WHEN** a client calls `getRoom` with an expired room member token and the access token of an `admin` user
- **THEN** the server answers `401` with message `Invalid token`

### Requirement: API key validation
The server SHALL accept an API key only when it equals the deployment's current API key, answer `401` with message `Invalid API key` otherwise, and answer `401` saying that no API key is configured yet when the deployment has none.

#### Scenario: No API key configured
- **GIVEN** a deployment without an API key
- **WHEN** a client calls `getRooms` with any `X-API-KEY`
- **THEN** the server answers `401` saying there are no API keys configured yet

### Requirement: API key identity
The server SHALL process a request authenticated with the API key as the root admin user (see `users`), so it passes every user role check of the endpoints that accept the API key and holds every room permission, as an administrator does (see `permissions`).

#### Scenario: Room created with the API key
- **WHEN** a client calls `createRoom` with the API key
- **THEN** the root admin owns the new room

### Requirement: Access token validation
The server SHALL answer `401` with message `Invalid token` to an access token that is malformed, not signed by the deployment, expired, or of another kind (refresh token or room member token), and `403` with message `Invalid token subject` when its user no longer exists.

#### Scenario: Refresh token used as access token
- **WHEN** a client sends a refresh token as `Authorization: Bearer <token>`
- **THEN** the server answers `401` with message `Invalid token`

#### Scenario: Deleted user
- **GIVEN** an access token of a user who has since been deleted
- **WHEN** the client calls `getMe`
- **THEN** the server answers `403` with message `Invalid token subject`

### Requirement: User role check
The server SHALL answer `403` with message `Insufficient permissions to access this resource` when a valid access token belongs to a user whose role the endpoint does not admit.

#### Scenario: Room member on an admin endpoint
- **GIVEN** the access token of a `room_member` user
- **WHEN** they call `createUser`
- **THEN** the server answers `403`

### Requirement: Login
The server SHALL authenticate a user through `loginUser` with `userId` and `password` and, when the account has no pending password change, answer `200` with an `accessToken` and a `refreshToken`.

#### Scenario: Successful login
- **GIVEN** an account `alice_smith` with password `secret123` and no pending password change
- **WHEN** a client calls `loginUser` with those credentials
- **THEN** the server answers `200` with an `accessToken` and a `refreshToken`

### Requirement: Login failures
The server SHALL answer `404` with message `Invalid user ID or password` both to an unknown `userId` and to a wrong password, without telling which one failed, and `422` when `userId` or `password` is missing or shorter than 5 characters.

#### Scenario: Wrong password
- **WHEN** a client calls `loginUser` with an existing `userId` and a wrong password
- **THEN** the server answers `404` with message `Invalid user ID or password`

#### Scenario: Unknown user
- **WHEN** a client calls `loginUser` with a `userId` that does not exist
- **THEN** the server answers the same `404` as for a wrong password

### Requirement: Temporary token for a pending password change
The server SHALL answer a successful `loginUser` of an account with a pending password change with `mustChangePassword: true` and a temporary `accessToken` valid for `MEET_PASSWORD_CHANGE_TOKEN_EXPIRATION` (default `15m`), without a `refreshToken`. A temporary token reaches only `getMe` and `changeUserPassword` (see `users`).

#### Scenario: Login of a newly created user
- **GIVEN** an account created through `createUser` that has not changed its password
- **WHEN** its user calls `loginUser` with the initial password
- **THEN** the server answers `200` with `mustChangePassword: true` and an `accessToken` but no `refreshToken`
- **AND** that token answers `403` on `getRooms`

### Requirement: Token lifetimes
The server SHALL issue access tokens valid for `MEET_ACCESS_TOKEN_EXPIRATION` (default `2h`), refresh tokens valid for `MEET_REFRESH_TOKEN_EXPIRATION` (default `1d`) and room member tokens valid for `MEET_ROOM_MEMBER_TOKEN_EXPIRATION` (default `2h`), and reject each one once it expires.

#### Scenario: Expired access token
- **GIVEN** an access token older than `MEET_ACCESS_TOKEN_EXPIRATION`
- **WHEN** the client calls `getMe`
- **THEN** the server answers `401` with message `Invalid token`

### Requirement: Tokens valid on every replica
The server SHALL sign every token with the deployment's `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, so a token issued by one replica is accepted by every other replica, and a change of those values invalidates every token already issued.

#### Scenario: Token issued on another replica
- **GIVEN** two Meet replicas configured with the same LiveKit credentials
- **WHEN** a user logs in through the first one and calls `getMe` through the second one with the returned access token
- **THEN** the second replica answers `200`

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

### Requirement: Refresh failures
The server SHALL answer `refreshAccessToken` with `400` when the refresh token is missing (`No refresh token provided`) or is invalid, expired or another kind of token (`Invalid refresh token`), and with `403` when its user no longer exists or has a pending password change.

#### Scenario: Access token sent as refresh token
- **WHEN** the client calls `refreshAccessToken` with an access token in `X-Refresh-Token`
- **THEN** the server answers `400` with message `Invalid refresh token`

#### Scenario: Password reset by an administrator
- **GIVEN** a user whose password an administrator reset after they logged in
- **WHEN** they call `refreshAccessToken` with their refresh token
- **THEN** the server answers `403` saying a password change is required

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

### Requirement: Role change invalidates access tokens
The server SHALL reject with `401` every access token issued before the latest change of its user's role, on every replica, while the user's refresh token keeps working and yields an access token that is accepted.

#### Scenario: Role changed on another replica
- **GIVEN** two Meet replicas and a logged-in `room_manager`
- **WHEN** an administrator changes that user's role through the first replica
- **AND** the user calls `getMe` through the second replica with the access token issued before
- **THEN** the second replica answers `401` with message `Invalid token`

#### Scenario: Refresh after a role change
- **GIVEN** a user whose role changed after they logged in
- **WHEN** they call `refreshAccessToken` with their refresh token
- **THEN** the server answers `200`
- **AND** the new access token is accepted with the new role

### Requirement: Room changes invalidate room member tokens
The server SHALL reject with `401` a room member token issued before the room's roles or access were last updated (`updateRoomRoles`, `updateRoomAccess`) or after the room was deleted, whoever it was issued to. A change of the room `config` leaves room member tokens valid.

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

### Requirement: Member and user changes invalidate room member tokens
The server SHALL reject with `401` a room member token bound to a room member issued before that member's permissions last changed or after the member was deleted, and a room member token bound to a user issued before that user's role last changed or after the user was deleted, on every replica.

#### Scenario: Member permissions updated
- **GIVEN** a room member token of an identified guest
- **WHEN** a manager of the room changes that member's `baseRole` through `updateRoomMember`
- **AND** the guest presents the token
- **THEN** the server answers `401` with message `Invalid token`

#### Scenario: User role changed
- **GIVEN** a room member token issued to a registered user who is a member of the room
- **WHEN** an administrator changes that user's role
- **AND** the user presents the token
- **THEN** the server answers `401` with message `Invalid token`

### Requirement: Demotion revokes room member tokens
The server SHALL reject with `401` every room member token issued to a participant before they were demoted from moderator (`participantRoleUpdate` or `participantUpdateRole`, see `meeting-moderation`), on every replica and for as long as such a token could still be valid, while a token issued to them after the demotion is accepted. Only `refreshRoomMemberToken` SHALL still renew it, into a token with the restored permissions (see `room-members`).

#### Scenario: Demoted on another replica
- **GIVEN** two Meet replicas and a participant promoted to moderator who holds a room member token issued during the promotion
- **WHEN** a moderator demotes that participant through the first replica
- **AND** the participant presents the earlier token to the second replica
- **THEN** the second replica answers `401` with message `Invalid token`

### Requirement: Single API key
The server SHALL keep at most one API key per deployment. `createApiKey` SHALL generate a new random key prefixed with `ovmeet-`, replace any existing one at once, and answer `201` with the `key` and its `creationDate`, including when two regenerations reach different replicas at the same time.

#### Scenario: Regenerating the key
- **GIVEN** a deployment whose API key is in use by an integrator
- **WHEN** an administrator calls `createApiKey`
- **THEN** the server answers `201` with a new key
- **AND** requests with the previous key answer `401` with message `Invalid API key`

#### Scenario: Two replicas regenerate together
- **GIVEN** two Meet replicas sharing the same database
- **WHEN** each receives a `createApiKey` at the same time
- **THEN** exactly one API key exists afterwards and only it is accepted

### Requirement: Read and revoke the API key
The server SHALL return from `getApiKeys` a list holding the current API key in full, or an empty list, and SHALL remove the API key on `deleteApiKeys`, after which every request with an API key answers `401` saying that no API key is configured. Webhook delivery without an API key is specified in `webhooks`.

#### Scenario: Revoking the key
- **GIVEN** a deployment with an API key
- **WHEN** an administrator calls `deleteApiKeys`
- **THEN** `getApiKeys` answers `200` with an empty list
- **AND** a request with the revoked key answers `401`

### Requirement: API key management access
The server SHALL accept `createApiKey`, `getApiKeys` and `deleteApiKeys` only with the access token of an `admin` user; the API key itself cannot manage API keys.

#### Scenario: Room manager
- **GIVEN** the access token of a `room_manager` user
- **WHEN** they call `getApiKeys`
- **THEN** the server answers `403`

### Requirement: Initial API key
At every startup the server SHALL register the value of `MEET_INITIAL_API_KEY` as the API key when it is set and the deployment has no API key, so a revoked initial key comes back at the next start while the variable remains set; an existing key is never replaced.

#### Scenario: Revoked initial key
- **GIVEN** `MEET_INITIAL_API_KEY` set and its key revoked through `deleteApiKeys`
- **WHEN** Meet restarts
- **THEN** the value of `MEET_INITIAL_API_KEY` is accepted again as the API key

#### Scenario: Two replicas start together
- **GIVEN** two Meet replicas starting at the same time on a deployment without an API key and with `MEET_INITIAL_API_KEY` set
- **WHEN** both finish starting
- **THEN** exactly one API key exists

### Requirement: Login rate limit
The server SHALL allow each client address 5 failed `loginUser` attempts per 5 minutes, not counting successful logins, and answer every further `loginUser` from that address in the window with `429`, a JSON body with `error` and `message`, and the `RateLimit` headers.

#### Scenario: Brute force
- **GIVEN** a client that failed to log in 5 times within 5 minutes
- **WHEN** it calls `loginUser` again, even with correct credentials
- **THEN** the server answers `429` with error `Too Many Requests`

#### Scenario: Attempts spread over replicas
- **GIVEN** two Meet replicas and a client whose 5 failed logins within 5 minutes were split between them
- **WHEN** it calls `loginUser` again on either replica
- **THEN** the server answers `429`, since the limit counts across the cluster (see `deployment`)

### Requirement: Rate limits on sensitive authentication actions
The server SHALL allow each client address 30 requests per minute to `refreshAccessToken` and `logoutUser` together, and 20 requests per 5 minutes to `createApiKey`, `getApiKeys`, `deleteApiKeys`, `resetUserPassword` and `changeUserPassword` together, API key requests included, answering `429` beyond them. General API rate limits are specified in `deployment`.

#### Scenario: Password reset flood
- **GIVEN** a client that sent 20 `resetUserPassword` requests within 5 minutes
- **WHEN** it sends another one with the API key
- **THEN** the server answers `429`

### Requirement: Console login
The console SHALL ask for `userId` and password on its login page, open the page the user originally requested after a successful login, send a user with a pending password change to the password change page (see `users`), and tell apart invalid credentials from too many attempts. A signed-in user who opens the login page is sent to the console. The embedded element shows the same login page when an entry requires a logged-in user (see `meeting-join`).

#### Scenario: Deep link while signed out
- **GIVEN** a signed-out user
- **WHEN** they open a console page, are sent to the login page and log in
- **THEN** the console opens the page they first requested

#### Scenario: Too many attempts
- **WHEN** the login answers `429`
- **THEN** the login page shows a too-many-attempts message instead of the invalid-credentials one

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

### Requirement: Console logout
The console SHALL log the user out from the logout button of the console toolbar (see `console`) by calling `logoutUser`, discarding the stored tokens and showing the login page.

#### Scenario: Logging out
- **GIVEN** a signed-in user
- **WHEN** they choose log out
- **THEN** the console shows the login page and requests no longer carry their tokens

### Requirement: Console API key section
The console SHALL show `admin` users, on its Embedded page, the current API key masked with controls to reveal and copy it and its generation date, a button to generate one when none exists, and buttons to regenerate or revoke it when one exists; a newly generated key is shown revealed.

#### Scenario: Generating the first key
- **GIVEN** an administrator on the Embedded page of a deployment without an API key
- **WHEN** they generate an API key
- **THEN** the console shows the new key revealed with its generation date
- **AND** offers to regenerate or revoke it
