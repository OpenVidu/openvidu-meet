# Proposal

## Why

A rotated refresh token is strictly single use, with no tolerance. With the console open in two tabs over plain HTTP (not localhost) both tabs refresh at once, one fails, and its error handler ends the session so every tab is signed out. A refresh whose response is lost after the server accepted it (proxy timeout, mobile network) burns the token and the retry signs the user out. In 3.9 neither happened.

## What Changes

- Depending on the decision below: either the server returns the already issued token pair again for a refresh token exchanged a few seconds earlier, or nothing changes in code and HTTPS is documented as required for multi-tab use.
- No delta spec yet: option A modifies "Refresh the access token" of `authentication` (single use, scenario "Rotated refresh token presented again"), so its delta is written once the decision is taken (task 1.1).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true` until the decision). Option A modifies `authentication` "Refresh the access token".

## Impact

- REST API: `refreshAccessToken` under option A (a repeat within the grace window answers `200` with the same pair); not affected under option B.
- Console UI: tabs stop signing each other out under option A.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code (option A): `claimRefreshToken` and `refreshToken` of `meet-ce/backend/src/controllers/auth.controller.ts`, and Redis storage of the issued pair under the claimed token identity on every replica.
- openvidu.io: the page on HTTPS and the console under option B; none under option A.

## Decisions to confirm

- Open product question 5. Option A: a grace window of a few seconds for a just-claimed refresh token, answering with the same issued pair (tokens stored in Redis for the window, which keeps live tokens there). Option B: accept the limitation and document HTTPS as required for multi-tab use.

## Source

3.10.0 pre-release audit, finding AU-4 (low, static-high), introduced by #130.
