# Design

## Context

Access, refresh and temporary tokens are LiveKit-format JWTs signed with the LiveKit credentials. Their metadata carries only `iat` (milliseconds) and `tokenType`; there is no session or token identifier. Validation compares `iat` with `user.roleUpdatedAt`. `logoutUser` has no auth middleware and ignores the request. The demotion revocation of room member tokens already uses the pattern this design reuses: a Redis key holding a revocation instant, with a TTL that outlives every token it could reject (`ParticipantTokenRevocationService`, `RedisKeyName.PARTICIPANT_TOKENS_REVOKED_AT`).

## Goals / Non-Goals

**Goals:**
- Logout, voluntary password change and rotation revoke tokens on every replica, with no persisted schema change.
- The console never logs a user out because two of its own refreshes collided.

**Non-Goals:**
- Revoking room member tokens obtained with a user's access token (their invalidation rules stay as specified in `authentication`).
- A session list or "log out everywhere" UI.
- Changing `resetUserPassword` or role-change behavior.

## Decisions

- **Session and token identifiers in the metadata.** `loginUser` and `changeUserPassword` mint a random session id (`sid`) carried by the access and refresh tokens they return; `refreshAccessToken` copies the `sid` into the tokens it returns. Each refresh token also carries its own random id (`rid`). The metadata schema accepts tokens without them, so tokens issued before the upgrade keep working until they expire (at most `MEET_REFRESH_TOKEN_EXPIRATION`).
  - Alternative: the JWT `jti` claim. Rejected: the LiveKit token builder sets `jti` to the identity, so it is not unique.
- **Three Redis keys, all with a TTL equal to the longest token lifetime** (max of `MEET_ACCESS_TOKEN_EXPIRATION`, `MEET_REFRESH_TOKEN_EXPIRATION`, `MEET_PASSWORD_CHANGE_TOKEN_EXPIRATION`), after which any token they could reject has expired anyway:
  - `user_session_revoked:<sid>`, set by `logoutUser` when the request carries a verifiable access or refresh token.
  - `user_tokens_revoked_at:<userId>`, set to the change instant by `changeUserPassword` before it mints the new tokens; a token with `iat` below it is rejected (same comparison as `roleUpdatedAt`, so the tokens minted right after are accepted).
  - `refresh_token_used:<rid>`, claimed with `SET NX` by `refreshAccessToken` before it rotates; a failed claim answers `400` `Invalid refresh token`. `SET NX` is atomic in the shared Redis, so two replicas exchanging the same token at once get one winner.
  - Alternative: a persisted MongoDB field (`passwordChangedAt`) like `roleUpdatedAt`. Rejected for now: it needs a migration, a schema version bump and a `MIGRATION_REV` refresh for a value that only matters for one refresh-token lifetime. Listed as a decision to confirm.
- **One service owns the checks.** A user-token revocation service (next to `ParticipantTokenRevocationService`) exposes revoke-session, revoke-before and claim-refresh, and an `isRevoked(userId, sid, iat)` that the access token validator and the refresh controller call with one `MGET`. The access token validator keeps answering `401` `Invalid token`; the refresh controller keeps answering `400` `Invalid refresh token`.
- **Console single-flight refresh.** The auth error handler shares one in-flight refresh promise among every request that fails with `401`, so a burst of expired requests produces one refresh. Across tabs, a refresh that answers `400` is retried once with the refresh token currently in browser storage when it differs from the one sent (another tab rotated it), before logging out. The voluntary password change in the profile page stores the returned tokens, as the forced change page already does.

## Risks / Trade-offs

- [Redis loses its data] -> revoked tokens become valid again until they expire (at most one refresh-token lifetime); the same trade-off the demotion revocation already accepts.
- [One extra Redis round trip per request with an access token] -> a single `MGET` of two keys, on the same Redis every request already uses for rate limits and locks.
- [Clients other than the console that refresh concurrently] -> the internal API has no compatibility promise and the console is its only client; the webcomponent shares the console services.
- [Tokens issued before the upgrade carry no `sid`] -> logout cannot revoke them individually; they expire within one refresh-token lifetime, and a password change still revokes them through the `iat` cutoff.

## Migration Plan

No data migration. All replicas run the same version, so every replica understands the new metadata from the start. Rollback leaves the Redis keys to expire on their own.
