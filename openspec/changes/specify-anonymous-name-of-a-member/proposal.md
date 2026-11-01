# Proposal

## Why

The name lock stops a member from choosing another name, but not an anonymous participant from taking a member's name: whoever joins first keeps it and the real member is shown with a suffix (`Guest Bea_1`). Impersonating a member with any anonymous link therefore stays possible, which is what the lock was meant to prevent.

## What Changes

Depending on the decision below:

- Option A: a member's or identified guest's name is reserved for them in the room, so an anonymous participant asking for it is suffixed even when they join first.
- Option B: first come keeps the name, and identified participants are marked in the meeting UI so a participant can tell them from anonymous ones.
- Whichever option is chosen, the delta spec of `meetings` ("Unique participant names") is written then; until then this change carries no spec.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`) until the decision is taken; then `meetings` "Unique participant names" (option A) or `meeting-layout` and `meetings` (option B).

## Impact

- Meeting UI: option B only (a badge or marker on identified participants).
- REST API, webhooks, embedded API (participant name as reported), console UI, deployment configuration: not affected beyond the name a participant gets.
- Code: name reservation of `participant-name.service.ts` and the join path of `room-member.service.ts` in `meet-ce/backend` (option A).
- openvidu.io: the page for meeting joins, after the decision.

## Decisions to confirm

- Open product question. Option A: reserve the names of members and identified guests for them (a reservation check per join against the room's members; the first anonymous "Guest Bea" becomes "Guest Bea_1"). Option B: keep first come, first kept, and show a marker on identified participants.

## Source

3.10.0 pre-release audit, finding RM-7 (low, verified-live; open product question 8), introduced by #131.
