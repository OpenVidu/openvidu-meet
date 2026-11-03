# Proposal

## Why

A demoted moderator can keep a moderator token that should have been revoked. The revocation is recorded only after the media server accepted the demotion, so a slow or failed step in between leaves the earlier tokens valid for up to two hours. In a deployment with several Meet replicas the revocation also compares the clocks of two replicas, so a token issued a few milliseconds before a demotion can be accepted or wrongly refused when the clocks differ.

## What Changes

- The demotion records the revocation before it updates the participant at the media server, so a demotion that is applied always has its earlier tokens revoked.
- The per-participant lock outlives the media server calls it covers.
- A token issued under that lock is stamped later than any revocation already recorded, and a demotion stamps with a small clock margin.
- No spec change: `authentication` "Demotion revokes room member tokens" already requires every earlier token to be rejected on every replica; this fix makes it hold under failures and clock skew.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `authentication` "Demotion revokes room member tokens".

## Impact

- REST API and embedded API: `participantRoleUpdate` and `participantUpdateRole` keep their contract; a demotion whose media server update fails now leaves the participant's earlier tokens revoked (one extra token regeneration for them).
- Webhooks, meeting UI, console UI, deployment configuration: not affected.
- Code: the demotion and token paths of `room-member.service.ts`, `participant-token-revocation.service.ts` and the lock constant of `internal-config.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions

Taken with the proposed option each time (USER, 2026-11-03):

- The revocation is recorded before the media server update (already in `fix-reconnect-with-earlier-join-token`).
- The lock is raised above the two media server requests it covers.
- Delivery: a regular public pull request; the demotion of a live participant is new in the unreleased 3.10.0.

## Source

3.10.0 pre-release audit, findings TK-3 (low, static-high) and TK-4 (low, static-plausible), introduced by #103.
