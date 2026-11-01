# Proposal

## Why

When Redis is unreachable, every request that carries a user access token, and `logoutUser`, never answers: the check for revoked tokens waits for Redis without a limit. The console is unusable for the whole outage, its logout button included, and the hung requests pile up until Redis returns. Release 3.9 served these requests without Redis.

## What Changes

- The revocation check waits for Redis at most about one second, so the request answers instead of hanging.
- What the request answers when the check expires depends on the decision below (`503`, or the token is accepted).
- A delta spec states the bounded wait; the outcome scenario is added once the decision is taken.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication`: requests authenticated with a user access token, and `logoutUser`, answer within a bounded time when Redis is unreachable.

## Impact

- REST API: every operation that accepts a user access token (public and internal) and `logoutUser`. With option A the OpenAPI gains a `503` response on them; with option B the contract does not change.
- Console UI: stays usable (option B) or shows its server-unavailable state instead of hanging (option A).
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- Code: the revocation service and the access-token validator and auth controller of `meet-ce/backend`.
- openvidu.io: none (REST API reference regenerated only if the OpenAPI changes).

## Decisions to confirm

- Open product question 4. Option A: fail closed, answer `503` when Redis cannot say whether the token is revoked (no revoked token is ever accepted, the console is down during the outage). Option B: fail open, accept the token when Redis cannot say (revoked tokens stay usable during an outage, the console keeps working).
- What `logoutUser` answers when the revocation cannot be recorded. Proposed: `503` under option A and `200` under option B. Alternative: `200` in both, as the spec says today.

## Source

3.10.0 pre-release audit, finding AU-1 (medium, verified-live), introduced by #130.
