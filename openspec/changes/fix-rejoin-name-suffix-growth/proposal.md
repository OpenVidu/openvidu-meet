# Proposal

## Why

A room member or signed-in user whose name got a numeric suffix, because another participant already used that name, gets a new suffix every time they open a second tab, reload or rejoin quickly: "Admin_1", then "Admin_2", then "Admin_3". The 3.10.0 changelog says that such a participant now keeps their name, which only holds when the name they asked for was free.

## What Changes

- When the name a member or user asks for is held by someone else, the server first gives them back the suffixed form of that name an earlier session of the same identity holds (such as "Admin_1"), and only generates a new suffix when there is none. The earlier session's departure does not free it, as for an unsuffixed name.
- Anonymous participants are not affected: each of their joins has a new identity, so no earlier session is theirs.
- The `meetings` spec states the rule for a suffixed name, with a scenario.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meetings`: "Joining again replaces the earlier session" covers the suffixed name an earlier session of the same identity holds, with the scenario "Second tab keeps a suffixed name".

## Impact

- Meeting UI, webhooks (`participantJoined`, `participantLeft`), embedded events and `participantList`/`participantGet`: a member or user keeps the same suffixed name across tabs, reloads and quick rejoins. No public contract changes.
- REST API: `generateRoomMemberToken` for joining a meeting returns a token carrying that name. Console UI, deployment configuration: not affected.
- Code: `reserveUniqueName` of `ParticipantNameService` (`meet-ce/backend/src/services/participant-name.service.ts`).
- openvidu.io: none (no page describes how a duplicate name is suffixed).

## Decisions to confirm

- When the same identity holds several suffixed forms of the name (several earlier sessions whose departures are still pending), which one the new session takes. Proposed: the one with the smallest number. Alternative: the most recently reserved one.
- How the identity's own suffixed name is found. Proposed: scan the reservations of the base name (`<base>_*`, the scan `findNextAvailableNumber` already does) and read their owners in one `MGET`, only when the exact name is held by someone else. Alternative: keep a per-identity index key in Redis, which adds a second key to keep consistent with every reservation and release.

## Source

3.10.0 pre-release audit, finding MT-6 (low, verified-live), introduced by #133.
