# Tasks

## 1. Answer a raise of someone else's hand with 409 for every caller

- [x] 1.1 Replace `withRoomPermissionForOthers` with `withHandUpdatePermission` in
  `meet-ce/backend/src/middlewares/room.middleware.ts`: the own hand needs no permission, lowering another's needs
  `participantHandLower`, raising another's only refuses a token of another room and leaves the `409` to the
  meeting service.
- [x] 1.2 `MeetingService.updateParticipantHand` checks the meeting before refusing a raise of someone else's hand.
- [x] 1.3 `tests/integration/api/meetings/hand.test.ts`: a speaker raising another speaker's hand gets `409` (it got
  `403`), a token of another room still gets `403`, and a raise of another hand in a room without a meeting gets
  `404` (it got `409`).
- [x] 1.4 OpenAPI `participantHandUpdate` description in `meet-ce/backend/openapi/meetings/meetings.yaml`: the `409`
  holds whatever the caller holds, and the feature switch's `403` covers the caller's own hand.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. Raise hand is new in the unreleased 3.10.0, so this fix belongs to its existing entry.
- [x] 2.2 openvidu.io: none.
