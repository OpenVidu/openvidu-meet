# Proposal

## Why

Meet keeps no server-side state for user sessions, so three actions that look like they end access do not: `logoutUser` leaves the access and refresh tokens valid until they expire (a copied token keeps working for up to `MEET_REFRESH_TOKEN_EXPIRATION`), a voluntary `changeUserPassword` leaves every session on every device signed in, and refresh token rotation hands out a new refresh token while the old one stays usable, so rotation adds nothing. The `authentication` and `users` specs describe today's behavior; this change proposes the behavior a user expects from logging out and changing a password. It is a product decision, flagged below.

## What Changes

- **Logout ends the session.** `logoutUser` with an access or refresh token revokes every token of that login session on every replica; other sessions of the user (other browsers) stay signed in. `logoutUser` without credentials still answers `200`.
- **A voluntary password change signs out every other session.** `changeUserPassword` rejects every access and refresh token issued to the user before the change and answers `200` with a fresh `accessToken` and `refreshToken`, so the browser that made the change stays signed in. Today these tokens are returned only when completing a forced change; returning them always is an additive payload change on the internal API.
- **Rotation makes refresh tokens single use.** With `MEET_REFRESH_TOKEN_ROTATION_ENABLED` `true`, a refresh token already exchanged answers `400` `Invalid refresh token`; with rotation off nothing changes.
- **Console.** It stores the tokens a voluntary password change returns, and it refreshes once for several requests that fail together and across tabs of the same browser, so single-use refresh tokens never log a user out by themselves.
- `resetUserPassword`, role changes and room member tokens keep their current invalidation rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication`: "Logout" ends the session on the server; "Refresh the access token" makes rotated refresh tokens single use; "Console session renewal" gains the scenarios of simultaneous renewals.
- `users`: "Change own password" returns new tokens and revokes every earlier token of the user.

## Impact

- Internal API: `logoutUser` reads the credentials it receives; `changeUserPassword` always returns `accessToken` and `refreshToken` (additive); `refreshAccessToken` answers `400` to a reused rotated token. Internal OpenAPI under `meet-ce/backend/openapi/auth/` and `meet-ce/backend/openapi/users/internal/` updated. No compatibility promise applies to the internal API.
- REST API: an access token of a logged-out session, or issued before a password change, answers `401` on every public endpoint that takes access tokens. No contract change; `401` is already listed.
- Console UI: stores the new tokens after a password change; single-flight refresh within a tab and across tabs.
- Embedded element: its login uses the same console auth services, so it inherits the console changes.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected. No new variable.
- Several replicas: revocation state lives in Redis with a bounded TTL (see design.md); no persisted MongoDB field, so no migration.
- openvidu.io: `docs/meet/features/users/management.md`, section "Changing your password" (the change signs out the other sessions).

## Decisions to confirm

- Server-side revocation at all (alternative: keep the stateless design the specs describe today and document it).
- Logout revokes only the current session (alternative: every session of the user, "log out everywhere").
- A voluntary password change revokes every other session and keeps the current one signed in with new tokens (alternative: keep other sessions; or revoke the current one too and send the user to the login page).
- A reused rotated refresh token answers `400` and nothing else (alternative: also revoke the whole session as suspected token theft).
- `changeUserPassword` always returns `accessToken` and `refreshToken` (payload change on the internal API).
- `resetUserPassword` keeps restricting the old tokens to `getMe` and `changeUserPassword` instead of revoking them (alternative: revoke them like a voluntary change).
- Revocation state kept in Redis with a TTL, lost if Redis loses its data (alternative: a persisted MongoDB field with a migration).
- One change for the three behaviors (alternative: split into three changes sharing the session identifier).
