# Proposal

## Decisions

Every decision below was taken by the user on 2026-11-18, the first in the request and the rest as answers to
numbered questions.

1. `GET /api/v1/meetings/{roomId}` (`meetingGet`) can carry the participants of the meeting, as `participantList`
   returns them, and the participants waiting to join, as `waitingParticipantList` returns them (the request).
2. They travel in two fields of the meeting, `participants` and `waitingParticipants`, and only when the client asks
   for them: the default response keeps the fields it had in 3.9 (answer to question 3).
3. The client asks with the query parameter `extraFields` or the header `X-ExtraFields`, under the rules rooms
   already follow: both combine and names that are not extra fields of the meeting are ignored (answer to question 4).
4. Every `meetingGet` response lists the extra fields a meeting has in `_extraFields`, both names, whatever the
   caller holds (answer to question 5).
5. `waitingParticipants` requires `waitingParticipantAdmin` besides the `meetingRead` the operation requires. A caller
   without it gets `200` with the field left out, never an empty list, and the documentation of the operation states
   the permission (answer to question 1).
6. `participantList` and `waitingParticipantList` stay as they are. `meetingGet` keeps answering `404` without a
   meeting, so `waitingParticipantList` remains the only read of those who wait before the meeting starts (answer to
   question 2).
7. `meetingGet` gets no `fields` parameter and no `X-Fields` header in this change (answer to question 6).

## Assumptions

- The typings name the extra fields as rooms do: `MEET_MEETING_EXTRA_FIELDS` and `MeetMeetingExtraField`.
- `participants` holds what `participantList` returns for the same meeting at that moment, and
  `waitingParticipants` what `waitingParticipantList` returns: same items, same limits (at most 100 waiting, none in
  an unlocked room), no promised order.
- The meeting of the SPA and the webcomponent keeps reading `meetingGet` without extra fields.

## Why

A backend that shows or supervises a live meeting needs three requests today to know its state: the meeting, its
participants and those waiting to join it. Letting `meetingGet` carry the two lists on request gives it one read of
the whole meeting, without making the default response heavier for the clients that only need the counters.

## What Changes

- `meetingGet` accepts the query parameter `extraFields` and the header `X-ExtraFields`, a comma-separated list of
  `participants` and `waitingParticipants`. The two combine and unknown names are ignored, as in the room operations.
- With `participants` requested, the response carries `participants`, the live snapshots `participantList` returns.
- With `waitingParticipants` requested and the caller holding `waitingParticipantAdmin` (an API key always does), the
  response carries `waitingParticipants`, the list `waitingParticipantList` returns. Without the permission the
  request still answers `200` and the field is left out.
- Every `meetingGet` response carries `_extraFields`, listing `participants` and `waitingParticipants`.
- Nothing else changes: the base fields, `meetingRead` as the permission of the operation, the `404` without a
  meeting, and the operations `participantList` and `waitingParticipantList`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meetings`: new requirement "Extra fields of a live meeting" (the opt-in, `participants`, `_extraFields`).
- `locked-room`: new requirement "Waiting participants in the meeting read" (`waitingParticipants` and its
  permission).

## Impact

- **REST API**: `meetingGet` grows additively: two optional request parameters, two optional response fields and
  `_extraFields`, which is added to every response of the operation. A 3.9 client keeps working unchanged.
- **Typings**: `MeetMeetingInfo` gains the optional `participants` and `waitingParticipants`, plus
  `MEET_MEETING_EXTRA_FIELDS` and `MeetMeetingExtraField`.
- **Webhooks, embedded API, meeting UI, console UI, deployment configuration, stored data**: not affected.
- **Code**: `meet-ce/typings/src/response/meeting-response.ts`; in `meet-ce/backend`, the route, validator,
  controller and service of `meetingGet`, the OpenAPI under `openapi/meetings/` and the integration tests of the
  meeting read and of the waiting participants.
- **PRO**: no seam needed; the service method PRO may override keeps its place.
- **openvidu.io** (`next`): the regenerated REST API reference, `docs/meet/features/meetings/moderation.md` (reading
  the meeting with its participants in one request) and `docs/meet/features/meetings/locked-room.md` (the waiting list
  inside the meeting read, and the permission it requires).
