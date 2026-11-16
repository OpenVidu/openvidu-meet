# Proposal

## Why

An audit of the 3.10.0 REST API against the released 3.9.0 contract (`MEET-REST-UNIFORMITY-FINDINGS.md`, findings S2, B1, B2, E1, E4 and E5) found six places where the unreleased operations answer, name or document something differently from the released ones for the same situation. They are unreleased, so they can be aligned now without a deprecation period. The same audit (N1) found the raise hand and reactions identifiers putting the object before the verb, against the naming charter (`meet-ce/typings/CLAUDE.md`) that every released permission and command follows; renaming them is free only before 3.10.0 ships. The operationIds that predate the charter (`createRoom`, `startRecording`, …) and the released `participantRoleUpdate` break it too; they were frozen for the next major because they would generate SDK method names, but Meet generates no SDK, so renaming them changes only the `#/operations/<id>` links of the docs.

## What Changes

- **BREAKING (unreleased)** `broadcastStart` answers `422`, not `400`, to a `destinationIds` entry the room does not have, as `roomCreate` and `roomUpdateConfig` already do for the same id: `400` stays for a body that cannot be read.
- **BREAKING (unreleased)** `participantUpdateHand` and `participantLowerAllHands` take `handRaised` instead of `raised`, the name the participant state (`MeetParticipantInfo.handRaised`) and the `participantHandChanged` webhook use, as `participantMute` sends `audioActive`.
- **BREAKING (unreleased)** `config.broadcast` requires its `enabled` whenever it is sent, at creation and on update, as every other feature object of the config does; a `broadcast` object without it answers `422`.
- `broadcastStop` answers its `409` with "is already being stopped", as `recordingStop` does for a recording that is stopping.
- **BREAKING (unreleased)** The `409` of `broadcastStart` and `broadcastStop` carries a code in `error` (`destination_in_use`, `already_broadcasting`, `no_participants`, `broadcast_busy`, `broadcast_ending`) instead of `Broadcast Error`, since each of them has several causes a client handles differently and only `message` told them apart; the waiting participants of the same release already answer with codes. The other broadcast refusals keep `Broadcast Error`.
- **BREAKING (unreleased)** The raise hand and reactions identifiers put the verb before the object, as the charter asks: the permissions `participantLowerHand` and `participantSendReaction`, the embedded commands `participantRaiseHand`, `participantLowerHand`, `participantLowerAllHands` and `participantSendReaction`, and the operationIds `participantUpdateHand`, `participantLowerAllHands` and the internal `participantSendReaction`. The internal `recordingLinkGet` becomes `recordingGetLink`. Rooms and room members stored by development builds keep their grants under the new permission names.
- Every `operationId` follows the charter, module first and verb before object, the released ones included: `createRoom` becomes `roomCreate`, `startRecording` `recordingStart`, `participantRoleUpdate` `participantUpdateRole`, the bulk operations `roomBulkDelete`, `recordingBulkDelete`, `waitingParticipantBulkReject`, `broadcastBulkStop` and so on, 54 in all. Methods, paths and bodies do not change, so no client breaks; the naming lint loses its frozen list and its bulk exception, and registers the platform modules `user`, `auth`, `config`, `analytics` and `ai`.
- The module tokens `hand` and `reaction`, registered for features that ended up under `participant`, leave the registry.
- The `404` of the broadcast operations documents the `Room Error` it answers when the broadcast's room does not exist.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-broadcast`: an unknown room destination in a start request answers `422`, and the conflicts of a start or a stop carry a code.
- `raise-hand`: the hand requests carry `handRaised`, and its permission, commands and operationIds are renamed.
- `reactions`: its permission, command and operationId are renamed.
- `permissions`: the hand and reaction permission names.
- `embedded-api`: the renamed commands in the command catalogue.
- Every capability whose requirements name an operation by its `operationId`, for the new names.
- `room-config`: `broadcast` joins the feature objects that carry their switch.

## Impact

- **REST API**: `broadcastStart`, `participantUpdateHand`, `participantLowerAllHands`, `roomCreate`, `roomUpdateConfig`, `broadcastStop` and `broadcastGet`; breaking only against the unreleased 3.10.0 contract, so no deprecated alias. Every renamed `operationId` changes its documentation anchor only.
- **Typings**: the renamed permission keys and `EmbeddedCommandName` members, `MeetParticipantHandOptions.handRaised`, `MeetBroadcastConfigOptions` requires `enabled`, and the new `MeetBroadcastErrorCode`.
- **Embedded API**: four commands renamed; the embedded API contract test changes. **Webhooks and events**: none, `participantHandChanged` and `participantReactionSent` already follow the charter.
- **Stored data**: room schema v10 to v11 and room member schema v7 to v8 carry the two permissions over from their first names.
- **UI and deployment configuration**: none; the permission labels keep their text under the new translation keys.
- **openvidu.io** (`next`): the regenerated REST and embedded references, the raise hand, reactions and permissions pages, and every `#/operations/<id>` link of the pages.
- **Docs of the charter**: `meet-ce/typings/CLAUDE.md`, `meet-ce/backend/openapi/README.md` and the migration plan in `../openvidu-competitors/meet-update-plan/` (§8.5 resolved).
- **Order**: this change builds on `stop-broadcast-by-id`, whose `broadcastStop` it documents, and archives after it.
