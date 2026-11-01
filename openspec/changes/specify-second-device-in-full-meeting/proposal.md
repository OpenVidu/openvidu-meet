# Proposal

## Why

A member or user who opens a second tab, or moves to another device, while the meeting is full (`maxParticipants` reached) is refused with "meeting full", because the count includes the session the new one would replace. The scenario "Same member in a second tab" of the `meetings` spec assumes the join goes through.

## What Changes

Depending on the decision below:

- Option A: a member or user whose identity is already in the meeting is not counted against the limit when joining again, since the new session replaces the earlier one.
- Option B: the refusal stays and the spec says that a full meeting refuses even a replacing session.
- The delta spec (`meetings` "Participant limit on joining" and "Joining again replaces the earlier session") is written once the decision is taken.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`) until the decision is taken.

## Impact

- REST API: the join-token request of a member or user (`generateRoomMemberToken`) in a full meeting (option A).
- Meeting UI: the "meeting full" screen no longer shows for a replacing session (option A).
- Webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: the participant count of `generateTokenForJoiningMeeting` in `room-member.service.ts` in `meet-ce/backend` (option A).
- openvidu.io: the page that documents participant limits, after the decision.

## Decisions to confirm

- Open product question. Option A: exclude the joining identity's own present session from the count. Option B: keep refusing and correct the spec scenario.
- Anonymous participants have no stable identity, so under option A they still count as new participants.

## Source

3.10.0 pre-release audit, finding MT-8 (low, static-high; open product question 8), introduced by earlier releases (the limit) and #133 (the replacement rule).
