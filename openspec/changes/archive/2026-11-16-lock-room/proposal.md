# Proposal

## Why

The waiting room merged in #219 for 3.10.0 uses names that do not follow the rest of the API: its REST operations take a list of identities in the body where every released operation on one participant names it in the path (`participantKick`, `participantMute`, `stopRecording`), its webhooks and events mix `participant*` and `waitingRoom*` prefixes, and the feature exposes a queue position and a count of free places that the product does not need. 3.10.0 is not released, so the contract can still change without a deprecation period.

## What Changes

- The feature becomes the **locked room**: a room whose `access.lock.enabled` is on makes the participants without `accessBypassLock` ask to join and wait until a holder of `waitingParticipantAdmin` admits or rejects them. The room config field `waitingRoom` leaves the config and becomes `access.lock` (`MeetRoomLock`) next to the room's other access settings, set with `createRoom` and `updateRoomAccess` instead of `updateRoomConfig`. The permissions `waitingRoomBypass` and `waitingRoomAdmin` become `accessBypassLock` and `waitingParticipantAdmin`, and the console and meeting UI call the feature "Locked room".
- What happens to a participant who waits is named `waitingParticipant*` on every surface:
  - REST, under `/api/v1/meetings/{roomId}/waiting-participants`: `waitingParticipantList` (`GET`), the new `waitingParticipantGet` (`GET /{participantIdentity}`), `waitingParticipantAdmit` (`POST /{participantIdentity}/admit`), `waitingParticipantAdmitAll` (`POST /admit`), `waitingParticipantReject` (`DELETE /{participantIdentity}`) and `bulkRejectWaitingParticipants` (`DELETE ?participantIdentities=a,b`), named and shaped like the released bulk deletes. The internal leave request moves to `POST /internal-api/v1/meetings/{roomId}/waiting-participants/leave` (`waitingParticipantLeave`).
  - Webhooks `waitingParticipantKnocked` and `waitingParticipantStatusChanged`.
  - Embedded events `waitingParticipantKnocked`, `waitingParticipantListUpdated` and `waitingParticipantStatusChanged` (the webhook and the event share one name; the event reaches the participant who waits and, for every wait, those in the meeting holding `waitingParticipantAdmin`), and commands `waitingParticipantAdmit`, `waitingParticipantAdmitAll`, `waitingParticipantReject` and `waitingParticipantRejectAll`.
- An admission names one participant in the path or applies to everyone waiting. A rejection names one participant in the path, or several in the query of the bulk rejection, which rejects each one on its own and answers `200`, or `400` listing those who did not wait, as the released bulk deletes do.
- Admitting everyone waiting admits all of them or nobody: when they outnumber the free places it answers `409` `not_enough_places` and the console disables "Admit all" in that case. It no longer admits the first in line up to the free places, and it answers `{ message }` like `participantMuteAll`, the webhooks telling who got in.
- **Removed**: `availablePlaces` (from the list, the `409` body and the `waitingParticipantListUpdated` event), the position in line (`queuePosition`, the "You're 2nd in line" waiting screen text and its screen reader announcements) and the arrival-order guarantee of the list. The meeting UI computes the free places it shows from the room and meeting data it already holds.
- The error code `waiting_room_full` becomes `waiting_list_full`, and the reason `waiting_room_disabled` becomes `room_unlocked`.

None of these names were released: every one replaces a 3.10.0 name outright, with no deprecated alias.

## Capabilities

### New Capabilities
- `locked-room`: a locked room and its waiting participants on every surface (REST, webhooks, embedded API, meeting UI, console), replacing `waiting-room`.

### Modified Capabilities
- `waiting-room`: every requirement is removed, moved to `locked-room`.
- `room-config`: the `waitingRoom` feature object leaves the config.
- `room-access`: the room's access settings gain `lock`, with its defaults, its validation and its disclosure; an access update is refused atomically while a meeting runs.
- `permissions`: `waitingRoomBypass` and `waitingRoomAdmin` become `accessBypassLock` and `waitingParticipantAdmin`.
- `authentication`: locking a room is an access update, so every access update, the lock message included, invalidates the room member tokens issued before.
- `meeting-join`: the join checks and the join screen of a locked room.
- `meetings`: an admission to a locked room starts the meeting.
- `meeting-moderation`: a kicked participant of a locked room waits again.
- `embedded-api`: the command and event catalogues and the command phases.
- `room-members`: the "Locked room" permission group of the member form.

## Impact

- **REST API**: breaking only against unreleased 3.10.0 names; nothing released changes. New operations `waitingParticipantGet` and `bulkRejectWaitingParticipants`, the latter named by the bulk rule the API naming lint gains.
- **Webhooks**: two webhook events renamed; payloads unchanged except the `reason` value `room_unlocked`.
- **Embedded API**: three events and two commands renamed, two commands added (`waitingParticipantAdmitAll`, and `waitingParticipantRejectAll`, which names everyone the meeting shows waiting to `bulkRejectWaitingParticipants`); `availablePlaces` and `queuePosition` removed. The embedded API contract test changes.
- **Room access and permissions**: `access.lock`, `accessBypassLock`, `waitingParticipantAdmin`; the migrations that introduced the unreleased 3.10.0 schema write these names directly, so nothing written by `main` under the old names is carried over. `updateRoomConfig` no longer takes the setting.
- **Meeting UI**: waiting screen without position, panel without arrival order, "Admit all" disabled when not everyone fits, "Locked room" naming.
- **Console UI**: the room wizard section and the member form permission group become "Locked room".
- **Deployment configuration**: none.
- **PRO**: the seams of #219 keep their shape (`LivekitWebhookService` constructor, projected waiting component); only their names change.
- **openvidu.io** (`next`): `docs/meet/features/meetings/waiting-room.md` becomes the locked room page, and the permission, room access, room config, webhook and moderation pages, the troubleshooting line, and the regenerated REST and embedded references change.
