# Design

## Context

The waiting room shipped to `main` in #219 and is unreleased (3.10.0). Its server side keeps the line only in Redis: a hash of entries per room, a sorted index of the identities waiting (added so a ping reads its position with `ZRANK`), a hash per wait found by `sha256(ticket)`, and a cluster-wide set of last-seen times. Eight Lua scripts change it (`knock`, `decide`, `return`, `consume`, `joined`, `presence`, `end`, sweep). `decide` takes an optional list of identities: with a list it is all or none, without one it admits the first in line up to the free places. The persisted parts are `config.waitingRoom` on rooms (schema v10) and the two permissions on room roles and members (members schema v7). See proposal.md for why the names and the contract change.

## Goals / Non-Goals

**Goals:**
- One vocabulary: `access.lock` for the room setting and `accessBypassLock` for skipping it, `waitingParticipant*` for everything about a participant who waits (`waitingParticipantAdmin` included), on REST, webhooks, the embedded API, typings and internal code.
- Remove what no longer has a product use (positions, arrival order, `availablePlaces`, named lists), and simplify the Redis model with it.

**Non-Goals:**
- No change to how a wait lives: the ticket, the realtime connection, the one-minute expiry, the `pagehide` leave, the admission that holds a place until LiveKit reports the join.
- No deprecated aliases: nothing here was released.

## Decisions

**The lock is room access, not room config.** `access` already decides who enters a room and through which door (anonymous links, registered users); the lock is one more condition on entering, while `config` holds what a meeting offers once inside (chat, recording, reactions). The console already edits it in the Room Access step of the wizard. It also matches how access behaves: like any access update it is refused while a meeting runs and invalidates the room member tokens issued before, so the conditional write that set `rolesUpdatedAt` only when a config update turned the lock on disappears. The cost is that every access update now invalidates tokens, a lock message edit or an unlock included, exactly as a change of the anonymous links or the user access already does; the change is only possible between meetings. `updateRoomAccess` gains the idle-room filter in its write that `updateRoomConfig` already had, so a meeting starting between the status read and the write keeps the stored settings. The shape is `access.lock` `{ enabled, message? }` (`MeetRoomLock`), next to `access.user.enabled`; on a request (`MeetRoomLockOptions`) `message` may be `null` to remove it. Alternative considered: keeping `config.locked`; rejected because the setting then lived apart from the other entry rules and needed its own token invalidation.

**Permission names.** The naming module of the setting is `access`, a noun, which replaces the adjective `locked` in `MEET_API_MODULES` and in the charter. `accessBypassLock` puts the verb before the object, as the charter requires. Admitting, rejecting and listing are operations on waiting participants, not on the lock, which only room managers change, so the permission that gates them is `waitingParticipantAdmin`: the module of the resources it gates, with `Admin` covering all their operations. Alternatives considered: `accessLockBypass` and `accessLockAdmin`; rejected because they put the object before the verb and `accessLockAdmin` reads as permission to lock the room.

**Capability `locked-room` replaces `waiting-room`.** The delta adds every requirement to a new capability and removes them from `waiting-room`, instead of modifying them in place, because the capability's subject and name both change. After archive the empty `waiting-room` folder is deleted and `locked-room` gets its Purpose. Scenario names of other capabilities keep their current wording ("Waiting room on"), since a MODIFIED block cannot rename them; they are retitled after archive.

**REST shape.** The participant goes in the path, like `participantKick` and `stopRecording`; admitting everyone uses the collection, like `participantMuteAll`, and rejecting several names them in the query, like the bulk deletes:

| Operation | Method and path under `/meetings/{roomId}` | Answer |
|---|---|---|
| `waitingParticipantList` | `GET /waiting-participants` | `{ participants }` |
| `waitingParticipantGet` | `GET /waiting-participants/{participantIdentity}` | `MeetWaitingParticipant` |
| `waitingParticipantAdmit` | `POST /waiting-participants/{participantIdentity}/admit` | `{ message }` |
| `waitingParticipantAdmitAll` | `POST /waiting-participants/admit` | `{ message }` |
| `waitingParticipantReject` | `DELETE /waiting-participants/{participantIdentity}` | `{ message }` |
| `bulkRejectWaitingParticipants` | `DELETE /waiting-participants?participantIdentities=a,b` | `{ message, deleted, failed }` |
| `waitingParticipantLeave` (internal) | `POST /waiting-participants/leave` | as today |

The operations on one participant and admitting everyone answer `{ message }`, as `participantKick`, `participantMute` and `participantMuteAll` do; who was admitted is told by the `waitingParticipantStatusChanged` webhooks. Rejecting everyone is the bulk rejection, which answers `{ message, deleted, failed }`. The bulk rejection takes the shape of `bulkDeleteRoomMembers`: at least one and at most `BULK_DELETE_MAX_ITEMS` (100) identities, trimmed and deduplicated, `422` otherwise; each one rejected on its own, `200` when all were and `400` with `failed` when any was not. A participant identity is never `admit` or `leave` (identities carry a random suffix), so the static segments never shadow a participant. Alternative considered: `DELETE /waiting-participants` with no identity rejecting everyone; rejected because every released `DELETE` on a collection requires explicit ids, so an empty query would have to mean "everyone" here and "nothing" everywhere else. Alternative considered: `POST /waiting-participants/reject` for symmetry with admit; rejected because `DELETE` matches `participantKick` and the bulk deletes. The id `bulkRejectWaitingParticipants` does not start with a module token, so the naming lint accepts `bulk` + verb + module plural, the shape of the released bulk deletes.

**`decide` becomes all or none in every case.** An admission takes one identity or none (everyone waiting) and admits nobody when the participants outnumber the free places; a rejection takes exactly one identity. The ordered admission up to the free places disappears, and so does the list of identities in the script. The bulk rejection runs the one-identity script per identity, so each rejection is atomic and one that finds the participant gone fails alone; it signals the meeting once per request.

**No positions.** The sorted index `<prefix>_line:<roomId>` and the `ZRANK` in `presence` are removed; `presence` no longer computes `queuePosition`, and the `waitingParticipant.state` message drops it. The list is read from the room hash and returned in no promised order; the panel may still sort rows by `knockDate` for a stable display, which the API does not promise.

**Free places in the meeting UI.** `availablePlaces` leaves the list, the `409` body and `waitingParticipantListUpdated`. The panel computes the free places as `maxParticipants` minus the participants of the meeting it sees, and disables Admit all when the participants waiting exceed them. It cannot see admissions not used yet, so the server's `409` `not_enough_places` remains the authority and is shown as a notice.

**Embedded commands mirror the REST operations.** `waitingParticipantAdmit({ participantIdentity })`, `waitingParticipantAdmitAll()`, `waitingParticipantReject({ participantIdentity })`, `waitingParticipantRejectAll()`, as `participantMute` and `participantMuteAll`. `waitingParticipantRejectAll` is the one command that composes: it reads the waiting list the meeting holds and calls `bulkRejectWaitingParticipants` with those identities, sending nothing when the list is empty. A `400` only lists participants who no longer waited, which is the end state the command wants, so it is not an error for the host nor a notice; any other failure is. The meeting UI's Deny all takes the same path. Alternative considered: one command with an optional identity; rejected because no released command treats an omitted identity as "everyone".

**Those who admit learn every status change.** `waitingParticipantStatusChanged` reaches the embedded element of the participant who waits and, for every wait of the room, that of each participant in the meeting holding `waitingParticipantAdmin`, so a host can tell whether someone left the list because they were admitted, rejected, left or expired. The server sends the change it reports to the webhook as the signal `meet_waiting_participant_status_changed`, addressed with `destinationIdentities` to the participants whose metadata grants `waitingParticipantAdmin`, since the payload names the participant who waits; the meeting relays it as the event. The list signal stays without data, sent to everyone. Alternative considered: a `waitingParticipantListUpdated` webhook mirroring the event; rejected because the two webhooks already tell every change, and a list snapshot delivered after a retry can overwrite a newer one, which a change event cannot.

**Names.** The events say what changed: `waitingParticipantListUpdated` carries the list `waitingParticipantList` answers, and `waitingParticipantStatusChanged` the new `status` of one wait. Both start with the singular module token, so the naming charter needs no plural form.

| Before (unreleased) | After |
|---|---|
| `config.waitingRoom`, `MeetWaitingRoomConfig` | `access.lock`, `MeetRoomLock` (`MeetRoomLockOptions` on requests) |
| `waitingRoomBypass`, `waitingRoomAdmin` | `accessBypassLock`, `waitingParticipantAdmin` |
| `MeetWaitingRoomParticipant`, `MeetWaitingRoomStatus`, `MeetWaitingRoomReason`, `MeetWaitingRoomErrorCode` | `MeetWaitingParticipant`, `MeetWaitingParticipantStatus`, `MeetWaitingParticipantReason`, `MeetWaitingParticipantErrorCode` |
| `participantKnocked` (webhook and event) | `waitingParticipantKnocked` |
| `participantWaitingChanged`, then `waitingParticipantChanged` (webhook and event) | `waitingParticipantStatusChanged` |
| `waitingRoomUpdated`, then `waitingParticipantsUpdated` | `waitingParticipantListUpdated` |
| `waiting_room_full`, `waiting_room_disabled` | `waiting_list_full`, `room_unlocked` |
| `waitingRoomTicket`, `waitingRoom.state`, `meet_waiting_room_updated` (then `meet_waiting_participants_updated`) | `waitingTicket`, `waitingParticipant.state`, `meet_waiting_participant_list_updated` |

Internal code follows: the backend `services/waiting-room/` becomes `services/waiting-participants/` (`WaitingParticipantService`, `WaitingParticipantAdmissionPolicy`, `WaitingParticipantRealtimeHandler`, `WaitingParticipantSweepTask`), the Redis key prefixes and the frontend `domains/meeting/waiting-room/` follow the same split, and the i18n keys move from `WAITING_ROOM.*` to `LOCKED_ROOM.*` (room setting) and `WAITING_PARTICIPANTS.*` (the wait). Redis entries of the old prefixes are not carried over: waits last minutes and a deploy restarts every replica (no mixed versions), so waits in flight at the deploy end and their participants ask again.

**UI copy.** Console: "Locked room" section, "Join a locked room" (`accessBypassLock`) and "Admit participants" (`waitingParticipantAdmin`) in a "Locked room" permission group. Meeting: "Waiting to join" panel section unchanged, "Stop waiting" replaces "Leave waiting room", "Too many people are waiting" replaces "The waiting room is full", the waiting screen says the participant waits to be let in with no position. All ten locales.

**Several replicas.** Nothing changes in the coordination: each decision is still one Lua script on the shared Redis, so two moderators on two replicas still get one `200` and one `404` or `409`; removing the line index removes one key per room and no cross-replica state is added.

## Risks / Trade-offs

- [Rooms and members stored by `main` since #219 carry `waitingRoom` and the old permission keys] → no migration carries them over: v10 and v7 are unreleased, so the migrations that introduced them (rooms v9 to v10, room members v6 to v7) write `access.lock` and the new permission keys directly, and the schema versions stay at 10 and 7. A development database already at v10/v7 is not migrated again and has to be reset.
- [Room member tokens issued by the old code carry `waitingRoomAdmin`] → they are read as denying `waitingParticipantAdmin` (the missing-permission rule of `permissions`) and refreshing the token fixes it; tokens are short-lived and only development deployments hold them.
- [The meeting UI enables Admit all while an unused admission takes the last place] → the `409` is shown as "not everyone fits" and nobody is admitted.
- [PRO compiles against renamed CE classes and the projected `<ov-meeting-waiting-room>`] → noted in the PR description; PRO renames when it resumes.

## Migration Plan

Deploy as any release: migrations run at startup under the lock, before replicas serve. The only deployments that ran the previous v10/v7 migrations are development ones built from `main`, which reset their database.
