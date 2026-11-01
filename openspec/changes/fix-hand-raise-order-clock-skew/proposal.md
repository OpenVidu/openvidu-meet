# Proposal

## Why

The raised-hand queue is ordered by the moment each hand went up, and that moment is read from the clock of whichever Meet replica serves the raise. With several replicas whose clocks differ, two hands raised close together can be queued in the wrong order, the same wrong order on every screen: a participant who raised second is called first. The error is bounded by the clock difference between replicas, so only raises that close together are affected.

## What Changes

- The moment a hand goes up (`handRaiseDate`) is read from one clock shared by every Meet replica, the Redis server's, which the replicas already use for their locks, instead of the clock of the replica that serves the raise. The queue then follows the order in which the server took the raises, whichever replica served each one.
- `handRaiseDate` stays a timestamp in milliseconds; its format and every surface that carries it are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `raise-hand`: "One queue for everyone" takes `handRaiseDate` from a clock shared by every replica, with a scenario of two replicas whose clocks differ.

## Impact

- REST API (`participantList`, `participantGet`), webhook `participantHandChanged`, embedded event `participantHandChanged`: `handRaiseDate` keeps its type and meaning; no contract change.
- Meeting UI: the queue order is the same on every screen and now matches the order of the raises across replicas.
- Console UI, deployment configuration: not affected.
- Code: `writeHand` in `meet-ce/backend/src/services/meeting.service.ts` and a time read in `meet-ce/backend/src/services/redis.service.ts`.
- Operations: one Redis `TIME` command per raise, inside the hand's existing lock.
- openvidu.io: none.

## Decisions to confirm

- Whether to fix it at all. Proposed: stamp raises with the Redis server's clock, one more Redis round trip per raise. Alternative: keep the replica's clock and accept a misorder bounded by the clock skew of the deployment, usually a few milliseconds under NTP.
- Which shared clock. Proposed: Redis `TIME`. Alternative: a per-meeting sequence counter in Redis stored next to the date, exact even across a Redis failover but a new participant attribute.

## Source

3.10.0 pre-release audit, finding IM-5 (low, static-plausible), introduced by #109.
