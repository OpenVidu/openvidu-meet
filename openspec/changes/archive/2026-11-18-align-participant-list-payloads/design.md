# Design

## Context

Both values already exist where they are needed; they are just not carried.

- `type` of a participant in the meeting: the Meet data a participant joins with (the LiveKit participant metadata, read by the backend's `MeetParticipantHelper.parseMeetingMetadata()` and by the browser's `parseParticipantMetadata()`) holds the `memberId` and `userId` of their credential. `WaitingParticipantAdmissionPolicy.participantTypeOf()` derives the waiting participant's `type` from the same two fields.
- `role` of a waiting participant: `RoomMemberService.generateRoomMemberToken()` resolves the `badge` before deciding that the participant waits, and both sides already turn a badge into a role (`MeetParticipantHelper.extractRole()`, `toParticipantRole()` in `embedded-participant.utils.ts`).

## Decisions

- **One derivation per value, in the typings.** `participantTypeOf({ memberId, userId })` and `participantRoleOf(badge)` become pure functions of `@openvidu-meet/typings`, next to `handRaiseDateOf()`, so the backend helper, the waiting admission policy and the browser's embedded events cannot disagree. They replace `participantTypeOf()` of the admission policy, `extractRole()`'s badge mapping and `toParticipantRole()`. A participant without Meet data gets no `type`: the helpers call `participantTypeOf()` only when the metadata parses.
- **`MeetParticipantType` lives next to `MeetParticipantPayload`** in `response/participant-response.ts`, moved from `database/room-member.entity.ts`, since it is no longer about waiting nor about room members.
- **The wait stores its role.** `WaitingKnockRequest` carries `role`, `WaitingParticipantService.knock()` writes it into the participant it stores, and the knock script already stores the participant JSON as given, so the role travels with `knockDate` through every later script (a return to waiting keeps the entry). `toParticipant()` in `waiting-participant.service.ts` copies it out. No script changes.
- **OpenAPI**: a shared schema `meetings/schemas/meet-participant-type.yaml`, referenced by `webhooks/schemas/meet-participant-payload.yaml` (optional `type`) and `meetings/schemas/meet-waiting-participant.yaml` (required `type`, replacing its inline enum); `role` added to the waiting participant schema; `get-meeting-participants.yaml` gets its order sentence and an example.

## Replicas

Nothing new is coordinated: `type` is read from the participant's metadata wherever the request lands, and `role` is part of the wait in Redis, which every replica reads.

## Risks / Trade-offs

- [A wait stored by a build without `role`, still in Redis when the new build starts, would be listed without it] → The feature is unreleased and waits end within minutes; no fallback is written.
