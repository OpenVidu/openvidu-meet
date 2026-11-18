# Proposal

## Decisions

Taken by the user on 2026-11-18, answering the questions of this proposal:

1. Every participant in the meeting carries `type` (`user`, `identified_guest`, `anonymous`), derived by the server as the waiting participant's is: on `participantList` and `participantGet`, on every webhook and embedded event that carries a participant of the meeting. The enum `MeetWaitingParticipantType` becomes `MeetParticipantType`, without a deprecated alias, since it has never been released.
2. A participant that did not join through Meet carries no `type`, as it carries no `externalId` nor `metadata`.
3. Every waiting participant carries `role`: the role they asked to join with, taken when they knock and kept while that wait lasts, including a return to waiting after an admission. The join recomputes the role, so a change to the member, to the room's roles or to the user made during the wait applies when they join, not to `role`.
4. `participantList` documents its order (none promised) and gets a response example, as `waitingParticipantList` has.
5. Contract only: the participants panel does not change.

## Why

The two lists of who is in or at the door of a meeting describe a participant differently. `participantList` tells the role but not how the participant came, and `waitingParticipantList` tells how they came but not the role they will have. An integrator who admits automatically, or who follows a participant from the waiting list into the meeting, has to read two shapes and cannot tell an anonymous participant in the meeting from a member. The waiting list is unreleased, so it can still change freely.

## What Changes

- `MeetParticipantPayload`, and so `MeetParticipantInfo`, gains an optional `type` of `MeetParticipantType`: `participantList`, `participantGet`, the webhooks `participantJoined`, `participantLeft`, `participantRoleChanged` and `participantHandChanged`, and the embedded events of those names and `participantReactionSent` carry it. Absent for a participant that did not join through Meet.
- **BREAKING (unreleased)** `MeetWaitingParticipantType` is renamed `MeetParticipantType`, same values.
- **BREAKING (unreleased)** `MeetWaitingParticipant` gains a required `role` (`moderator` or `speaker`): `waitingParticipantList`, `waitingParticipantGet`, the webhooks `waitingParticipantKnocked` and `waitingParticipantStatusChanged`, and the embedded events `waitingParticipantKnocked`, `waitingParticipantListUpdated` and `waitingParticipantStatusChanged` carry it.
- The OpenAPI of `participantList` states that its participants come in no particular order and gets an example.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meetings`: a new requirement, "A participant tells how they joined", defines `type` for the participants of the meeting; "List and read the participants of a meeting" lists `type` and promises no order; "Participants that did not join through Meet" adds that they carry no `type`; "participantJoined webhook" carries `type`.
- `locked-room`: "The waiting list tells how each participant came" also tells the role they asked to join with, and when it is taken.

## Impact

- REST API: `participantList` and `participantGet` grow additively (`type`, optional). `waitingParticipantList` and `waitingParticipantGet` gain `role`, breaking only against the unreleased 3.10.0 contract.
- Webhooks: `participantJoined`, `participantLeft`, `participantRoleChanged` and `participantHandChanged` grow additively. `waitingParticipantKnocked` and `waitingParticipantStatusChanged` gain `role` (unreleased).
- Embedded API: the participant events grow additively; the waiting participant events gain `role` (unreleased). No attribute or command changes.
- Typings: `MeetParticipantType` replaces `MeetWaitingParticipantType`; `MeetParticipantPayload.type` and `MeetWaitingParticipant.role` are new.
- Meeting UI, console UI, deployment configuration: not affected.
- Stored data: a wait in Redis keeps its `role`. Waits live only while they last and the feature is unreleased, so no migration.
- openvidu.io (`next`): the REST API reference (`docs/meet/embedded/reference/api.html`) and the embedded events reference (`shared/meet/webcomponent/events.md`) are regenerated; the `waitingParticipantStatusChanged` example of `docs/meet/features/meetings/locked-room.md` shows `role`.

## Assumptions

- A participant who asks to join again starts a new wait, so their `role` is taken again, like their `knockDate`.
