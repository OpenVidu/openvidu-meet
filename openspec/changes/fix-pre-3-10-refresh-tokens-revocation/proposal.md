# Proposal

## Why

Refresh tokens issued by 3.9 can be exchanged any number of times and survive `logoutUser` until they expire (one day by default), although 3.10 says a rotated refresh token is accepted once and that logout ends the session. During the first day after the upgrade, whoever holds such a token keeps access after the user has signed out.

## What Changes

- With rotation enabled, a refresh token that carries no rotation and session identity (every token issued before 3.10) answers `400` with `Invalid refresh token`.
- Users signed in before the upgrade sign in once more; an Upgrade notes line says so.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication`: refresh tokens issued before 3.10 are refused when rotation is enabled.

## Impact

- REST API: `refreshAccessToken` (public and internal) answers `400 Invalid refresh token` to old tokens; the documented responses do not change.
- Console UI: a user signed in before the upgrade is taken to the login page at their next token refresh.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: `refreshToken` of `meet-ce/backend/src/controllers/auth.controller.ts`.
- openvidu.io: none.

## Decisions to confirm

- Refuse refresh tokens issued before 3.10. Proposed: refuse them, one forced sign-in after the upgrade. Alternative: accept the one-day window explicitly and amend the changelog line "a rotated refresh token is accepted once" to say it does not hold for tokens issued before the upgrade.
- Delivery: private advisory or regular public pull request.

## Source

3.10.0 pre-release audit, finding AU-3 (low, verified-live), introduced by #130.
