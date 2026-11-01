# Proposal

## Why

A departing session frees its name only if it holds the reservation, which Meet decides by comparing its own clock with the join time reported by the media server. With Meet a second ahead of a media node (Elastic and High Availability), a session's own departure never frees its name, so the next "Ana" becomes "Ana_1" for twelve hours. With the opposite skew, an earlier session's late departure frees the name the new session holds, and another participant can take the same name.

## What Changes

- The reservation carries a stamp that is also written into the join token's metadata, and a departure frees the name only when it carries the same stamp.
- The comparison of Meet's clock with the media server's is removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meetings`: new requirement "A name is released only by the session that holds it", next to "Participant names are released" and "Joining again replaces the earlier session".

## Impact

- Webhooks, REST API, embedded API, meeting UI, console UI: not affected beyond the names participants get.
- Deployment: no configuration; the fix matters when Meet and the media nodes run on different machines.
- Code: the reserve and release scripts of `participant-name.service.ts` and the token metadata and release path of `room-member.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- Where the stamp travels. Proposed: in the token metadata, which the media server already returns for the session. Alternative: a participant attribute (a second place that clients can read).

## Source

3.10.0 pre-release audit, finding MT-7 (low, static-high; release semantics verified live), introduced by #133.
