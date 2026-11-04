# Design

## Context

`fix-role-demotion-revocation-timing` stamps a demotion's revocation 10 seconds ahead of the replica's clock, so a token another replica issued just before, from a clock slightly ahead, is still older than the stamp. To keep the tokens issued after the demotion valid, every token gets the issue time `max(now, revocation + 1)`. That future issue time is also what the room, member and user checks compare with `rolesUpdatedAt`, `permissionsUpdatedAt` and `roleUpdatedAt`, which are stamped with the plain clock, so a change made in the following 10 seconds does not invalidate the token.

## Decision

- Every issue point already reads the revocation under the participant lock. It now writes the value it read into the token metadata (`issuedAfterRevocation`) and stamps `iat` with its own clock.
- A token is revoked when a revocation is recorded and the token does not carry that same value: it was issued before it, or before a later one. No clock is compared, so the margin goes away and the revocation stores the plain time.
- The value is only compared for equality; it keeps being a time so the Redis key stays readable.

## Alternatives

- Future-date the room, member and user change stamps too: a token issued right after such a change would be refused for 10 seconds, signing the participant out.
- Drop the margin and keep the time comparison: brings back the clock skew between replicas that the margin was added for.

## Several replicas

The revocation lives in Redis per room and identity, with the lifetime of a room member token, so every replica reads the same value. Whichever replica issues a token reads it under the per-participant lock the demotion also holds, so a token issued after the demotion always carries it, and a token issued before never does. No persisted field changes in MongoDB, so no migration.
