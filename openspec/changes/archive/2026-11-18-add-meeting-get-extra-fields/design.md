# Design

## Context

The change stays in the backend, after the typings, and takes no architecture decision: it reuses the extra fields
mechanism rooms already have. What shapes the approach:

- `MeetingService.getMeetingInfo` already lists the meeting's participants to count them, so `participants` costs a
  mapping and no new read. The waiting list is one MongoDB read of the room's lock and one Redis read behind
  `WaitingParticipantService.list`, made only when `waitingParticipants` is requested and granted.
- `models/zod-schemas/field-selection.schema.ts` holds the shared field list parsing (`fieldListSchema`) and the
  merge of the `X-Fields` header into the query, which broadcasts and recordings use. Rooms and room members carry
  older private copies of the same for `extraFields` and `X-ExtraFields`.
- `withRoomPermission('meetingRead')` gates the route and stays. `waitingParticipantAdmin` cannot be a second gate
  there, since lacking it must not refuse the request.

## Approach

- **Typings** (`meet-ce/typings/src/response/meeting-response.ts`): `MeetMeetingInfo` gains the optional
  `participants` and `waitingParticipants`, next to `MEET_MEETING_EXTRA_FIELDS` and `MeetMeetingExtraField`. Both
  fields are optional, so the constant is checked against `ExtraFieldKey<Required<MeetMeetingInfo>>`:
  `ExtraFieldKey` resolves an optional property to `never`.
- **Request**: `meetingGet` gets a validator (`request-validators/meeting-validator.middleware.ts`, schema in
  `models/zod-schemas/meeting.schema.ts`) that reads `extraFields` with `fieldListSchema(MEET_MEETING_EXTRA_FIELDS)`
  into `res.locals.validatedQuery`. The header merge of `field-selection.schema.ts` is made to serve
  `X-ExtraFields` and `extraFields` as well as `X-Fields` and `fields`, instead of a third copy. The copies of rooms
  and room members are left alone.
- **Permission**: the controller drops `waitingParticipants` from the requested extra fields unless
  `RoomAccessService.getAuthenticatedRoomMemberPermissions(roomId)` grants `waitingParticipantAdmin`, the read
  `withRoomPermission` makes, and only when the field was requested. An API key holds every permission there.
- **Read**: `getMeetingInfo(roomId, extraFields)` maps the participants it already lists with
  `MeetParticipantHelper.toParticipantInfo`, as `getParticipants` does, and reads the waiting list in the batch that
  runs under the active meeting check, so a room without a meeting answers its `404` whatever was requested.
  `MeetingService` gains `WaitingParticipantService` as a dependency, which builds no cycle:
  `WaitingParticipantService` depends on repositories and low-level services only. Keeping the read in the one
  service method leaves the PRO seam where it is.
- **Response**: the controller adds `_extraFields` with `addHttpResponseMetadata` of `helpers/field-filter.helper.ts`.
- **Contract**: `openapi/meetings/`, two parameters (`meeting-extra-fields.yaml`, `meeting-x-extra-fields-header.yaml`),
  the three properties on the meeting schema and the description of `meetingGet`, which states that
  `waitingParticipants` requires `waitingParticipantAdmin`.

A request without extra fields does the work it did before.

## Replicas

The read keeps no state: participants come from the media server and the waiting list from Redis, so any replica
answers the same.

## Risks / Trade-offs

- The two lists are read at slightly different instants, so a participant admitted in between can show in both or in
  neither → same as calling `participantList` and `waitingParticipantList` one after the other; the webhooks remain
  the way to follow each change.
