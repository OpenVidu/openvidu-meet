# Design

## Context

`ParticipantNameService.reserveUniqueName` stores one Redis key per lower-cased name (`SET NX` with a TTL, value = reservation timestamp) and falls back to `name_<n>` from a number pool when the key exists. The reservation happens while generating a join token, before the participant connects. `handleParticipantLeft` frees `participant.name` unconditionally. Room members and users keep their identity across joins (member id or user id), and LiveKit disconnects an earlier session with the same identity (`duplicate_identity`) when the new one connects.

## Goals / Non-Goals

**Goals:**
- A member or user rejoining before their earlier departure is processed keeps their name.
- The late departure of the earlier session never frees the name the new session holds, on any replica.

**Non-Goals:**
- Anonymous participants (a new identity per join, see the proposal's decision).
- Other per-identity state the same departure clears (meeting presence of a user, live captions usage); they are separate concerns.

## Decisions

- **The reservation records its owner.** The key's value becomes `{ identity, reservedAt }`. Reserving a name that exists succeeds without a suffix when its `identity` equals the requester's, and rewrites `reservedAt`; otherwise the current suffix logic runs. The identity is known before reserving for members and users (it is their member or user id), so the token flow only has to decide the identity first, which today happens right after the reservation.
- **The release is a compare-and-delete.** `releaseName` receives the leaving session's identity and join time and deletes the key only if `identity` matches and `reservedAt` is not later than that join time, in one Redis script (atomic across replicas). A reservation rewritten after the leaving session joined belongs to a newer session of the same identity, so it is kept. The number-pool bookkeeping runs only when the key is actually deleted.
  - Alternative: skip the release when the leave reason is `duplicate_identity`. Rejected: it covers the second-tab case but not the quick rejoin after a normal leave, whose departure arrives with `client_initiated`.
  - Alternative: re-reserve the name on `participant_joined`. Rejected: it leaves a window in which a third participant can take the name, and it adds a second write path.
- **Clock comparison.** `reservedAt` is taken from the Meet replica clock and the join time from the media server. A misjudgement needs a rejoin within the clock skew of the earlier session's own join, which a session that reached the meeting and left does not produce in practice; the same skew assumption already underlies the meeting duration deadline.
- **Multi-replica.** All state is the Redis key; reservation (`SET` with a conditional script) and release (compare-and-delete script) are single atomic Redis operations, so it holds for any number of replicas and for the webhook being handled by a different replica than the token generation.

## Risks / Trade-offs

- [Existing reservations written before the upgrade hold a bare timestamp] -> Treat a value without an identity as owned by nobody: it is released as today and never reused by identity. Reservations live at most the reservation TTL, so the mixed state ends on its own; no migration (Redis is not versioned and all replicas run the same version).
- [An identified participant opening the meeting in two tabs at once] -> Both reuse the same name; LiveKit keeps the later session and disconnects the earlier one, so only one session shows the name.
