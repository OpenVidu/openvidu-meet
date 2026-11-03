# Design

## Context

A demotion reads the participant, updates it at the media server and then stamps `revoked_at` in Redis; tokens with an issue time at or below the stamp are rejected. The lock around the sequence expires after 10 s, as long as one media server call may take, and the stamp and the token issue time come from the clocks of whichever replicas handle each request.

## Decision

- Stamp before the media server update. If the update then fails, the stamp is still there: the participant's client regenerates its token (a regeneration keeps the promotion) and nothing is accepted that should not be.
- Set the lock time to live above two media server calls (the read and the update).
- Under the lock a refresh or regeneration already holds, read the stamp and issue the token with a time later than it; the demotion stamps with a small margin (the existing refresh clock tolerance) so a replica clock slightly behind cannot let an earlier token through.

## Alternatives

- Keep stamp-after-update and retry the stamp: leaves a window in which the process can die between the two steps.
- Shorten the media server client timeout instead of lengthening the lock: smaller lock, but a slow media server then fails demotions that would have succeeded.

## Several replicas

The stamp lives in Redis under the room and identity, with the lifetime of a room member token, so every replica sees it. The lock is the existing per-participant Redis lock. Reading the stamp under the lock removes the dependence on two replicas agreeing on the time between a refresh and a demotion; the margin covers the remaining skew. No persisted field changes, so no migration.
