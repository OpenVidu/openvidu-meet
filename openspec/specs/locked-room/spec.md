# locked-room Specification

## Purpose

A locked room makes the participants who ask to join wait until a participant with `waitingParticipantAdmin` admits or rejects them, so the host sees who asks before letting anyone in. This capability covers the lock as a room access setting, who waits, the wait itself and how it ends, the waiting list, admitting and rejecting, the places an admission holds, and what a participant who was not let in can do, relied on by room managers through the console, by moderators in the meeting and by integrators through the REST API, webhooks and the embedded API.

Surfaces: REST API (`access.lock` of `createRoom` and `updateRoomAccess`, and `/meetings/{roomId}/waiting-participants`; `meet-ce/backend/openapi/meetings/`), webhooks (`waitingParticipantKnocked`, `waitingParticipantStatusChanged`), embedded API (the `waitingParticipant*` events and commands; `meet-ce/typings/src/embedded/`), console (Room Access step of the room wizard), meeting UI (Ask to join on the join screen, the waiting screen, the Waiting to join section of the participants panel). The access settings as a whole are specified in `room-access`, the two permissions and their defaults in `permissions`, the join checks in `meeting-join`. Documented in openvidu.io `docs/meet/features/meetings/locked-room.md` and `docs/meet/features/rooms/access.md`.

## Requirements

### Requirement: A room is locked per room access

The room access field `access.lock.enabled` SHALL decide whether a room makes the participants who ask to join wait, `false` by default. The optional `access.lock.message`, up to 500 characters, SHALL be shown to the participants while they wait. Like the rest of the access settings, `access.lock` SHALL NOT change while a meeting runs (see `room-access`), and the meeting SHALL offer no way to unlock the room.

#### Scenario: Room created unlocked

- **WHEN** a client creates a room without `access.lock`
- **THEN** `getRoom` returns `access.lock.enabled` false and every participant joins directly

#### Scenario: Message too long

- **WHEN** a client calls `updateRoomAccess` with an `access.lock.message` of 501 characters
- **THEN** the server answers `422` and the access settings are unchanged

#### Scenario: Unlocking during a meeting

- **GIVEN** a locked room and a meeting running
- **WHEN** its owner calls `updateRoomAccess` with `access.lock.enabled` false
- **THEN** the server answers `409` and the room stays locked

### Requirement: Who waits

In a locked room, a participant who asks to join SHALL wait instead of joining, unless they hold `accessBypassLock`. A participant who reloads the page, waiting or joined, SHALL ask again and wait. An admin and the room's owner hold every permission and SHALL join directly. The server checks of `meeting-join` SHALL run before a participant waits, except the participant limit, which applies when their join token is issued. Gaining `accessBypassLock` while waiting SHALL NOT end the wait.

#### Scenario: Speaker waits

- **GIVEN** a locked room whose speaker role denies `accessBypassLock`
- **WHEN** a participant with the anonymous speaker link presses "Ask to join"
- **THEN** they see the waiting screen and do not enter the meeting

#### Scenario: Moderator joins directly

- **GIVEN** a locked room whose moderator role grants `accessBypassLock`
- **WHEN** a participant with the anonymous moderator link presses join
- **THEN** they enter the meeting

#### Scenario: Admitted member reloads

- **GIVEN** a member without `accessBypassLock` who was admitted and is in the meeting
- **WHEN** they reload the page and ask to join again
- **THEN** they wait again, as a new wait

#### Scenario: Granted accessBypassLock while waiting

- **GIVEN** a member waiting in a locked room
- **WHEN** a manager grants their role `accessBypassLock`
- **THEN** they keep waiting until a holder of `waitingParticipantAdmin` admits them

#### Scenario: Closed room

- **GIVEN** a closed locked room
- **WHEN** a speaker asks to join
- **THEN** the server answers `409` and the "Closed room" error screen is shown, as in an unlocked room

### Requirement: Asking to join gives a waiting ticket, not a token

Asking to join a room where the participant waits SHALL answer with a waiting ticket and the participant as `MeetWaitingParticipant`, not a token. The ticket SHALL serve only its own wait: its realtime connection, the join token once admitted, and leaving. It SHALL last as long as the wait and give no access to the meeting's media or API. Asking SHALL NOT start the meeting, reserve the name or take a place in it.

#### Scenario: Waiter knows its identity

- **GIVEN** a participant with the anonymous speaker link of a locked room
- **WHEN** they ask to join and wait
- **THEN** the answer carries the waiting ticket and the participant, with the identity that `waitingParticipantList` lists and `participantJoined` reports after their admission

#### Scenario: Room stays open

- **GIVEN** an open locked room and no meeting running
- **WHEN** a speaker asks to join and waits
- **THEN** the room status stays `open` and no `meetingStarted` webhook is sent

#### Scenario: Waiting while the meeting is full

- **GIVEN** a locked room and `maxParticipants` 2, whose meeting holds 2 participants
- **WHEN** a third participant asks to join
- **THEN** they wait

#### Scenario: Name over the character limit

- **GIVEN** a locked room
- **WHEN** a participant asks to join with a name of 1025 characters
- **THEN** the server answers `422` and nobody is listed as waiting

#### Scenario: Waiting holder of waitingParticipantAdmin

- **GIVEN** a locked room and a member granted `waitingParticipantAdmin` and denied `accessBypassLock`, waiting
- **WHEN** their client calls `waitingParticipantList`, or `waitingParticipantAdmit` with their own identity
- **THEN** the server refuses it and they keep waiting

#### Scenario: Waiting holder of meetingEnd

- **GIVEN** a member granted `meetingEnd` and denied `accessBypassLock`, waiting while a meeting runs
- **WHEN** their client calls `meetingEnd`
- **THEN** the server refuses it and the meeting goes on

#### Scenario: Long wait

- **GIVEN** a participant waiting with a steady connection
- **WHEN** three hours pass before a moderator admits them
- **THEN** they join the meeting

### Requirement: A wait lasts while the participant stays in touch

A participant SHALL start waiting when they ask to join, and keep waiting only while their meeting client stays connected to Meet through its realtime connection, whichever replica it reaches (see `deployment`); one whose client never connects SHALL stop waiting within about 20 seconds of asking. Stopping the wait, from its button or with `meetingLeave`, SHALL end the wait at once, even while the realtime connection is down.

#### Scenario: Asking without ever connecting

- **GIVEN** a client that asks to join and never opens its realtime connection
- **WHEN** 20 seconds pass
- **THEN** `waitingParticipantList` no longer lists it

#### Scenario: Stopping the wait

- **GIVEN** a participant waiting
- **WHEN** they press "Stop waiting"
- **THEN** `waitingParticipantList` no longer lists them

#### Scenario: Leaving while reconnecting

- **GIVEN** a participant waiting whose realtime connection is being restored after a network change
- **WHEN** they press "Stop waiting"
- **THEN** `waitingParticipantList` no longer lists them and a `waitingParticipantStatusChanged` webhook with `left` is sent

#### Scenario: Replica stops

- **GIVEN** two replicas and a participant waiting whose realtime connection is held by replica A
- **WHEN** replica A stops and the client reconnects through replica B
- **THEN** the participant keeps waiting

### Requirement: A minute without the connection ends the wait

A participant whose realtime connection has been down for about a minute, whatever the reason (network loss, a phone suspending the page, a browser that crashed, a web component element removed by its host), SHALL lose their place and their wait SHALL end as expired, never as left, which only leaving reports. Their meeting SHALL then stop reconnecting, say they lost their place and offer to ask again, or show the connection error screen if it never reached Meet during that wait.

#### Scenario: Short network loss

- **GIVEN** a participant waiting
- **WHEN** their connection drops and comes back 20 seconds later
- **THEN** they are still waiting and no new `waitingParticipantKnocked` webhook is sent

#### Scenario: Network lost for two minutes

- **GIVEN** a participant waiting
- **WHEN** their device loses its network for two minutes
- **THEN** `waitingParticipantList` stops listing them within about a minute of the loss
- **AND** their meeting says they lost their place and offers to ask again, which starts a new wait

#### Scenario: Host removes the embedded element

- **GIVEN** an embedded participant waiting, through the web component or through an iframe
- **WHEN** the host application removes the element or the iframe
- **THEN** `waitingParticipantList` stops listing them within about a minute, with a `waitingParticipantStatusChanged` webhook with `expired`, not `left`

#### Scenario: Realtime connection blocked

- **GIVEN** a network that blocks the realtime connection to Meet
- **WHEN** a participant asks to join
- **THEN** about a minute later their meeting shows the connection error screen, not that they lost their place

### Requirement: A page that goes away ends the wait

A participant whose page closes, reloads or navigates away SHALL end their wait at once as `expired`, with `reason` `page_closed` and `origin` `system`, when the browser lets the page tell Meet as it goes; a page discarded without that loses its place as a client out of touch. The realtime connection closing alone SHALL NOT end the wait. A moderator SHALL see them leave the list at once. Coming back SHALL be a new wait, with a new `waitingParticipantKnocked`.

#### Scenario: Tab closed

- **GIVEN** a participant waiting and a moderator with the participants panel open
- **WHEN** the participant closes the tab
- **THEN** the moderator's list drops them within a few seconds
- **AND** one `waitingParticipantStatusChanged` webhook is sent with `status` `expired` and `reason` `page_closed`

#### Scenario: Iframe removed by its host

- **GIVEN** a participant waiting in an iframe
- **WHEN** the host application removes the iframe
- **THEN** their wait ends as `expired` with `reason` `page_closed` within a few seconds

#### Scenario: Tab discarded in the background

- **GIVEN** a participant waiting on a phone
- **WHEN** the system discards the browser tab in the background without the page telling Meet
- **THEN** their wait ends as `expired` with `reason` `connection_lost` within about a minute

#### Scenario: Proxy restarted

- **GIVEN** participants waiting behind a reverse proxy
- **WHEN** the proxy restarts and closes every realtime connection
- **THEN** each waiting participant reconnects and keeps waiting

### Requirement: Every request to join is a new wait

Each time a participant asks to join, except to continue a remembered wait that is still on, it SHALL start a new wait. When the same identity already waits (a member or a user asking again from another tab or another device), the earlier wait SHALL end as left, with `reason` `replaced`, and the earlier screen, if still open, SHALL say they lost their place.

#### Scenario: Member asks from a second device

- **GIVEN** a member waiting on a laptop
- **WHEN** they ask to join the same room from a phone
- **THEN** the phone shows them waiting, with a new `knockDate`
- **AND** the laptop says they lost their place
- **AND** `waitingParticipantList` lists them once

### Requirement: A reload asks to join again on its own

A participant who reloads the page while waiting SHALL ask to join again on their own, without the join screen, as a new wait with a new `waitingParticipantKnocked`, a member or a user keeping their identity. The page SHALL remember its tab's wait until it ends and continue it while it is on. The join screen SHALL show only when it has something to ask, such as a name, or when the room no longer makes the participant wait.

#### Scenario: Member reloads while waiting

- **GIVEN** a member waiting
- **WHEN** they reload the page
- **THEN** the waiting screen shows them waiting with the same identity and a new `knockDate`, without the join screen
- **AND** a `waitingParticipantKnocked` webhook is sent for the new wait, after a `waitingParticipantStatusChanged` webhook with `expired` and `reason` `page_closed` for the earlier one

#### Scenario: Anonymous participant reloads repeatedly

- **GIVEN** an anonymous participant waiting
- **WHEN** they reload the page three times
- **THEN** `waitingParticipantList` lists them once

#### Scenario: Reload after the room was unlocked

- **GIVEN** a participant who reloads the page after the room was unlocked
- **WHEN** the page loads
- **THEN** the join screen shows, and joining enters the meeting with the identity they waited with

#### Scenario: Reload after the wait ended

- **GIVEN** a participant who reloads the page after the wait they left behind was rejected, expired or ended with the meeting
- **WHEN** the page loads
- **THEN** they ask to join as the first time, and wait

#### Scenario: Reload after the page was closed for a while

- **GIVEN** a participant whose page was closed for two minutes
- **WHEN** they open the room again in a new tab
- **THEN** they ask to join as the first time, and wait

### Requirement: Waiting list

`GET /api/v1/meetings/{roomId}/waiting-participants` (`waitingParticipantList`) SHALL require `waitingParticipantAdmin` (`403`) and return `participants`, those waiting as `MeetWaitingParticipant`, in no promised order, and `GET /api/v1/meetings/{roomId}/waiting-participants/{participantIdentity}` (`waitingParticipantGet`) that participant while they wait, or `404` with `error` `participant_not_waiting`. Both SHALL answer whether or not a meeting runs.

#### Scenario: Two participants waiting

- **GIVEN** Ana and Ben waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantList`
- **THEN** `participants` holds Ana and Ben, each with their identity, name and `knockDate`

#### Scenario: Waiting before the meeting starts

- **GIVEN** a room with no meeting running and a participant waiting
- **WHEN** a backend calls `waitingParticipantList` with the API key
- **THEN** it returns that participant

#### Scenario: Without the permission

- **GIVEN** a room member token without `waitingParticipantAdmin`
- **WHEN** its holder calls `waitingParticipantList` or `waitingParticipantGet`
- **THEN** the server answers `403`

#### Scenario: One participant

- **GIVEN** Ana waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantGet` with her identity
- **THEN** the server answers `200` with her identity, name, `type` and `knockDate`

#### Scenario: Participant no longer waiting

- **GIVEN** Ana admitted a moment ago
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantGet` with her identity
- **THEN** the server answers `404` with `error` `participant_not_waiting`

### Requirement: Limit on the waiting list

A room SHALL hold at most 100 participants waiting: one more asking to join SHALL be refused with `409` and see that too many people are waiting.

#### Scenario: Waiting list full

- **GIVEN** a room with 100 participants waiting
- **WHEN** another participant asks to join
- **THEN** the server answers `409` and they see that too many people are waiting

### Requirement: The waiting list tells how each participant came

Each `MeetWaitingParticipant` SHALL carry a `type` the server derives from the credential of the request: `user` for a participant who asked with their own Meet account, `identified_guest` for one who asked with their personal member link, `anonymous` for one who asked with a shared link of the room. It SHALL also carry the `role` that credential gave when they asked, kept while that wait lasts, a return to waiting included; their join SHALL take the role their credential gives then. The participants panel SHALL mark each `anonymous` row.

#### Scenario: Shared link

- **GIVEN** a participant who asked to join with the room's anonymous speaker link
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantList`
- **THEN** their entry has `type` `anonymous` and `role` `speaker`, and the panel marks their row

#### Scenario: Account and personal link

- **GIVEN** a user waiting with their own account and an identified guest waiting with their personal link
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantList`
- **THEN** the entries have `type` `user` and `identified_guest`, and the panel marks neither row

#### Scenario: Name chosen by the participant

- **GIVEN** an anonymous participant who typed the name "Dr. Ruiz"
- **WHEN** a moderator looks at the panel
- **THEN** the row reads "Dr. Ruiz" with the "Shared link" marker

#### Scenario: Moderator link

- **GIVEN** a room whose moderator role lacks `accessBypassLock`, and a participant who asked to join with its anonymous moderator link
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantGet` for them
- **THEN** the server answers `200` with `role` `moderator`

#### Scenario: Role changed during the wait

- **GIVEN** an identified guest waiting with `role` `speaker`
- **WHEN** an administrator gives the member the moderator role and a holder of `waitingParticipantAdmin` admits them
- **THEN** their entry kept `role` `speaker` until the admission, and they join the meeting as `moderator`

### Requirement: The correlation fields prove nothing

The `externalId` and `metadata` of a `MeetWaitingParticipant` SHALL be what the participant's client sent, never verified. A backend that admits on its own SHALL identify a waiting participant by `type` and by the `participantIdentity` of a member or user, which the server derives from their personal link or account.

#### Scenario: Forged external id

- **GIVEN** a room's anonymous speaker link
- **WHEN** a participant opens it with `participant-external-id` "u-42" and asks to join
- **THEN** `waitingParticipantList` lists them with `externalId` "u-42", `type` `anonymous` and an identity the server generated

### Requirement: Admit or reject one participant

`POST /api/v1/meetings/{roomId}/waiting-participants/{participantIdentity}/admit` (`waitingParticipantAdmit`) SHALL admit the participant named in the path and `DELETE /api/v1/meetings/{roomId}/waiting-participants/{participantIdentity}` (`waitingParticipantReject`) SHALL reject them, both requiring `waitingParticipantAdmin` (`403`) and answering `404` `participant_not_waiting` when they do not wait. Admitting SHALL answer `409` `not_enough_places` when no place is free.

#### Scenario: Admitting one

- **GIVEN** a participant waiting
- **WHEN** a moderator holding `waitingParticipantAdmin` calls `waitingParticipantAdmit` with their identity
- **THEN** the server answers `200` and the participant enters the meeting

#### Scenario: Rejecting one

- **GIVEN** Ana and Ben waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantReject` with Ana's identity
- **THEN** the server answers `200`, Ana is told she wasn't let in and Ben keeps waiting

#### Scenario: Participant who left meanwhile

- **GIVEN** Ben, who stopped waiting an instant ago
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantAdmit` with Ben's identity
- **THEN** the server answers `404` with `error` `participant_not_waiting` and `participantIdentity` Ben's identity

#### Scenario: Last free place

- **GIVEN** a meeting with `maxParticipants` 3, two participants connected and Ana and Ben waiting
- **WHEN** a moderator admits Ana and, before she appears in the meeting, admits Ben
- **THEN** the first admission answers `200` and the second `409` with `error` `not_enough_places`, and Ben keeps waiting

#### Scenario: Admitting on two replicas

- **GIVEN** two replicas, a meeting with one free place and two participants waiting
- **WHEN** two moderators admit one each at the same time, through different replicas
- **THEN** one admission answers `200` and the other `409`, one participant enters and the other keeps waiting

#### Scenario: Admitted participant who never comes

- **GIVEN** a meeting with `maxParticipants` 3, two participants connected, Ana admitted who closes her page, and Ben waiting
- **WHEN** a minute passes after Ana's admission and a moderator admits Ben
- **THEN** the server answers `200` and Ben enters the meeting

### Requirement: The moderator is told who left before the decision

When a decision names a participant who is no longer waiting, the meeting of the moderator who made it SHALL tell them with a notification, instead of an error, naming who left, and SHALL show the list as it stands. It SHALL do so wherever the decision was made: the participants panel or the knock notification.

#### Scenario: Admitting someone who left meanwhile

- **GIVEN** a moderator whose list still shows Ana, who stopped waiting an instant ago
- **WHEN** the moderator admits Ana
- **THEN** a notification says that Ana already left
- **AND** the list no longer shows her

### Requirement: Refusals name their cause with a code

A refused request about waiting participants SHALL carry in `error` a code that tells the cause apart without reading `message`: `participant_not_waiting`, with the participant in `participantIdentity`, `not_enough_places`, `waiting_list_full`, or `wait_ended`, with `status` when Meet knows how the wait ended.

#### Scenario: Admitting someone who no longer waits

- **GIVEN** Ben, who stopped waiting
- **WHEN** a client calls `waitingParticipantAdmit` with Ben's identity
- **THEN** the server answers `404` with `error` `participant_not_waiting` and `participantIdentity` Ben's identity

#### Scenario: Admitting everyone when not all fit

- **GIVEN** a meeting with one free place and Ana and Ben waiting
- **WHEN** a client calls `waitingParticipantAdmitAll`
- **THEN** the server answers `409` with `error` `not_enough_places`
- **AND** both keep waiting

#### Scenario: Waiting list full

- **GIVEN** a room with 100 participants waiting
- **WHEN** one more asks to join
- **THEN** the server answers `409` with `error` `waiting_list_full`

### Requirement: Admitting everyone waiting

`POST /api/v1/meetings/{roomId}/waiting-participants/admit` (`waitingParticipantAdmitAll`) SHALL require `waitingParticipantAdmin` (`403`) and admit everyone waiting at that moment, all of them or nobody: when they outnumber the free places, counting the admitted participants who have not joined yet, it SHALL admit nobody and answer `409` with `error` `not_enough_places`. Otherwise it SHALL answer `200` with only a `message`, also when nobody waits; the webhooks tell who got in.

#### Scenario: Everyone fits

- **GIVEN** a meeting with three free places and Ana, Ben and Zoe waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantAdmitAll`
- **THEN** the server answers `200` with a `message`, Ana, Ben and Zoe enter the meeting, and a `waitingParticipantStatusChanged` webhook with `admitted` is sent for each

#### Scenario: Fewer free places than participants waiting

- **GIVEN** a meeting with two free places and Ana, Ben and Zoe waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantAdmitAll`
- **THEN** the server answers `409` with `error` `not_enough_places` and the three keep waiting

#### Scenario: Admitted participant on the way in

- **GIVEN** a meeting with two free places, Ana admitted who has not joined yet, and Ben and Zoe waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantAdmitAll`
- **THEN** the server answers `409` and Ben and Zoe keep waiting

#### Scenario: Admitting all without a participant limit

- **GIVEN** a room without `maxParticipants` and three participants waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantAdmitAll`
- **THEN** the three enter the meeting

### Requirement: Rejecting waiting participants in bulk

`DELETE /api/v1/meetings/{roomId}/waiting-participants?participantIdentities=a,b` (`bulkRejectWaitingParticipants`) SHALL require `waitingParticipantAdmin` (`403`) and reject each participant named on their own. It SHALL answer `200` when all were rejected and `400` when any was not, with `deleted` and `failed` listing each side. It SHALL answer `422` for no identity or more than 100 distinct ones.

#### Scenario: Rejecting everyone named

- **GIVEN** Ana, Ben and Zoe waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `bulkRejectWaitingParticipants` naming Ana and Ben
- **THEN** the server answers `200` with Ana and Ben in `deleted` and `failed` empty, both are told they weren't let in, and Zoe keeps waiting

#### Scenario: Naming someone who no longer waits

- **GIVEN** Ana waiting and Ben admitted
- **WHEN** a client calls `bulkRejectWaitingParticipants` naming Ana and Ben
- **THEN** the server answers `400` with Ana in `deleted` and Ben in `failed`, and Ana is rejected

#### Scenario: Too many or no identities

- **WHEN** a client calls `bulkRejectWaitingParticipants` naming nobody, or 101 distinct identities
- **THEN** the server answers `422` and nobody is rejected

### Requirement: One decision per participant across replicas

Decisions on the same waiting participant SHALL apply one at a time across every replica: the first one SHALL apply, a later decision naming them SHALL answer `404` or, in a bulk rejection, list them in `failed`, and a later admission of everyone waiting SHALL leave them out, since the participant no longer waits.

#### Scenario: Admit and reject at once on two replicas

- **GIVEN** two replicas sharing Redis and a participant waiting
- **WHEN** one moderator admits them through replica A while another rejects them through replica B
- **THEN** one request answers `200`, the other `404`, and the participant is either admitted or rejected, not both

### Requirement: Admitted participants join with the identity they waited with

An admitted participant's meeting SHALL join without reloading the page, keeping the devices chosen, with the identity they waited with. The server SHALL issue their join token only after admission, applying at that moment the checks of `meeting-join`. Asking for the join token with the waiting ticket before admission SHALL keep the participant waiting with the same identity and `knockDate`, and so SHALL finding the meeting full once admitted.

#### Scenario: Admitted participant appears in the meeting

- **GIVEN** a participant waiting with identity `ana-x1`
- **WHEN** they are admitted
- **THEN** the `participantJoined` webhook reports identity `ana-x1`

#### Scenario: Admission starts the meeting

- **GIVEN** an open room with no meeting running and a participant waiting
- **WHEN** a backend admits them with the API key
- **THEN** they join and the room status becomes `active_meeting`

#### Scenario: Asking again before admission

- **GIVEN** a participant waiting
- **WHEN** their client asks for the join token with the waiting ticket
- **THEN** they are still waiting, with the same identity and `knockDate`

#### Scenario: Admission repeated while the join is in progress

- **GIVEN** an admitted participant whose meeting is asking for its join token
- **WHEN** their state is repeated before the answer arrives
- **THEN** they join the meeting once and never see "You lost your place"

### Requirement: A wait that ended is reported, never renewed

A request or a reconnection with the ticket of a wait that has ended SHALL NOT start a new wait: the participant SHALL be told how it ended, at the latest about 20 seconds after it ended while their connection stays up. The ticket SHALL give a join token only for a wait ended as admitted, and only if the participant would now join without waiting. Only asking again from the screen that reports it ("Ask to join again") SHALL start a new wait.

#### Scenario: Rejected while out of touch

- **GIVEN** a participant waiting whose network drops
- **WHEN** a moderator rejects them and their network comes back
- **THEN** their meeting says they weren't let in
- **AND** `waitingParticipantList` does not list them and no new `waitingParticipantKnocked` webhook is sent

#### Scenario: Laptop asleep for an hour

- **GIVEN** a participant whose laptop slept for an hour while waiting
- **WHEN** the laptop wakes up
- **THEN** their meeting says they lost their place and offers to ask again, without starting a new wait

#### Scenario: Decision message lost

- **GIVEN** a participant waiting whose realtime connection stays up
- **WHEN** a moderator rejects them and the message carrying the rejection never reaches them
- **THEN** within about 20 seconds their meeting says they weren't let in

#### Scenario: Replaying the ticket after a kick

- **GIVEN** a speaker without `accessBypassLock` who was admitted, joined the meeting and was kicked
- **WHEN** their client asks for a join token with the waiting ticket of that admission
- **THEN** the server answers `409` and issues no token

### Requirement: What happens when an admission cannot complete

An admitted participant who finds the meeting full when asking for their join token SHALL go back to waiting, with the same identity and `knockDate`. One whose meeting then fails to connect SHALL see the meeting's connection error or "Meeting full" screen and SHALL ask again to come back. A closed room SHALL end the wait with the "Closed room" screen; withdrawn access SHALL show that access error screen while the admission expires.

#### Scenario: Meeting full at the admission

- **GIVEN** Ana admitted, and the last free place taken by a holder of `accessBypassLock` before she asks for her join token
- **WHEN** her meeting asks to join
- **THEN** she is waiting again and `waitingParticipantList` lists her under `participants`
- **AND** a `waitingParticipantStatusChanged` webhook with `waiting` is sent, and her embedded host receives `waitingParticipantStatusChanged` with `waiting` at once

#### Scenario: Media server refuses the admitted participant

- **GIVEN** Ana admitted, whose join token was issued and whose connection to the meeting's media keeps failing
- **WHEN** her meeting gives up joining
- **THEN** she sees the connection error screen and `waitingParticipantList` does not list her
- **AND** her place counts as taken until a minute after her admission

#### Scenario: Rejected after an admission that did not complete

- **GIVEN** a member admitted who found the meeting full and is waiting again
- **WHEN** a moderator rejects them and they reload and ask to join again
- **THEN** they wait again, as a new wait

#### Scenario: Room closed before joining

- **GIVEN** a participant admitted to an open room with no meeting running
- **WHEN** the room is closed before their meeting asks for their join token
- **THEN** their wait ends and the "Closed room" error screen is shown

### Requirement: An admission holds its place until the participant joins

An admitted participant SHALL count as a taken place from their admission until LiveKit reports their identity in the room, and for one minute at most. An admission not used within that minute SHALL end as expired, from the server's own rule, and its place SHALL be released. Getting the join token SHALL NOT release the place. A participant counted both as connected and as admitted SHALL only make the free places lower, never higher.

#### Scenario: Admission never used

- **GIVEN** a meeting with `maxParticipants` 3, two participants connected and Ana admitted, who closes her page
- **WHEN** a minute passes after her admission
- **THEN** her place is free again and her wait ends with a `waitingParticipantStatusChanged` webhook with `expired`
- **AND** a script that keeps its connection open without asking for the join token loses the place the same way

#### Scenario: Participant joins

- **GIVEN** a meeting with `maxParticipants` 4, two participants connected and Ana admitted, whose join token was issued
- **WHEN** LiveKit reports Ana in the room
- **THEN** her admission stops counting at once and she takes one place as a connected participant

#### Scenario: Joined notice lost

- **GIVEN** an admitted participant who joined the meeting, whose joined notice never reaches Meet
- **WHEN** a minute passes after their admission
- **THEN** their place stops counting and no `waitingParticipantStatusChanged` webhook with `expired` is sent

#### Scenario: Notice reaches another replica

- **GIVEN** two replicas, Ana admitted through replica A, and LiveKit's joined notice for Ana handled by replica B
- **WHEN** a moderator calls `waitingParticipantList` through replica A
- **THEN** her place no longer counts

### Requirement: Only participants let in reach the meeting

In a locked room, a join token SHALL be issued only to a holder of `accessBypassLock` or to an admitted participant, and locking the room SHALL invalidate every room member token issued before (see `authentication`). A join token SHALL then connect to the room's media until it expires, its holder is kicked (see `meeting-moderation`), or a later change invalidates it (see `authentication`). A participant already in the meeting who loses `accessBypassLock` stays in it.

#### Scenario: Token from before the lock

- **GIVEN** a speaker who joined a meeting while the room was unlocked and kept their join token
- **WHEN** the owner locks the room and the speaker connects to the room's next meeting with that token
- **THEN** they are removed at once, and asking to join again makes them wait

### Requirement: Only participants who joined act on the meeting

In a locked room, a room member token without a participant identity, one obtained without joining, SHALL hold for every server check only `recordingList`, `recordingPlay`, `recordingDownload`, `recordingDelete` and `roomShareAccessLinks`: every operation gated by another permission, such as `meetingRead`, `meetingEnd`, a participant permission, `recordingControl`, `broadcastControl`, `broadcastEdit` or `waitingParticipantAdmin`, SHALL answer `403`. API keys SHALL keep their access.

#### Scenario: Waiting participant lists the participants

- **GIVEN** a participant waiting with a speaker link whose role grants `meetingRead`
- **WHEN** their client calls `participantList` for the room
- **THEN** the server refuses it

#### Scenario: Admitted participant reads the meeting

- **GIVEN** a speaker admitted to the running meeting
- **WHEN** their client calls `meetingGet`
- **THEN** the server answers `200`

#### Scenario: Link holder who never asked

- **GIVEN** a room member token obtained with the speaker link without asking to join
- **WHEN** its holder calls `meetingGet` while a meeting runs
- **THEN** the server answers `403`

#### Scenario: Second token of an admitter who waits

- **GIVEN** a member granted `waitingParticipantAdmin` and denied `accessBypassLock`, waiting
- **WHEN** they obtain a token without joining and call `waitingParticipantAdmit` with their own identity
- **THEN** the server answers `403` and they keep waiting

#### Scenario: Moderator demoted during the meeting

- **GIVEN** a moderator who joined without waiting and was demoted to a speaker role granting `meetingRead`
- **WHEN** their client calls `participantList`
- **THEN** the server answers `200`

#### Scenario: Recordings of the room

- **GIVEN** a token obtained without joining, granting `recordingList`
- **WHEN** its holder calls `recordingList` for the room
- **THEN** the server answers `200`

### Requirement: Share links before joining

In a locked room, the anonymous links `roomShareAccessLinks` reveals to a token obtained without joining SHALL be measured against the permissions the token was granted, as once joined: a moderator shares the room's links from the Join screen, and a participant who waits never reads a link that lets its holder join without waiting.

#### Scenario: Moderator shares the room before joining

- **GIVEN** a locked room and a moderator on the Join screen, with a token obtained without joining
- **WHEN** their client reads the room's access links
- **THEN** the server returns the moderator and speaker links and the Join screen offers the share link

#### Scenario: Waiting speaker allowed to share

- **GIVEN** a locked room whose speaker role grants `roomShareAccessLinks`
- **WHEN** a speaker who has not joined reads the room's access links
- **THEN** the server returns the speaker link and not the moderator link

### Requirement: Rejected participants may ask again

A rejected participant SHALL leave the waiting list and be told they were not let in. Their screen SHALL offer "Ask to join again" at once; asking again starts a new wait.

#### Scenario: Asking again after a rejection

- **GIVEN** a participant who was rejected
- **WHEN** they press "Ask to join again"
- **THEN** they wait again, with a new `knockDate` and a new `waitingParticipantKnocked`

### Requirement: What ends a wait without a decision

A wait SHALL end, telling the participant why, when the meeting running in the room is ended on purpose (from the meeting, the embedded API or the REST API, or by its duration limit), when the room is closed or deleted, from the moment it actually closes, and when the participant stops waiting. A participant who asks to join after a meeting ended SHALL wait for the next one.

#### Scenario: Asking right after the end

- **GIVEN** a meeting a moderator has just ended
- **WHEN** a participant asks to join two seconds later
- **THEN** they keep waiting for the next meeting

#### Scenario: Meeting ended by a moderator

- **GIVEN** a meeting running and a participant waiting
- **WHEN** a moderator ends the meeting for everyone
- **THEN** the participant's wait ends and their screen says the meeting has ended

#### Scenario: Room closed during a meeting

- **GIVEN** a meeting running and a participant waiting
- **WHEN** its owner closes the room
- **THEN** the participant keeps waiting while the meeting runs
- **AND** when the meeting ends and the room closes, their wait ends and the "Closed room" error screen is shown

#### Scenario: Room closed without a meeting

- **GIVEN** an open room with no meeting and a participant waiting
- **WHEN** its owner closes the room
- **THEN** the participant's wait ends and the "Closed room" error screen is shown

### Requirement: A meeting left empty does not end the waits

A meeting that ends because its last participants left or lost their connection SHALL NOT end any wait.

#### Scenario: Host loses the connection

- **GIVEN** a moderator alone in a meeting and a participant waiting
- **WHEN** the moderator's laptop sleeps for one minute and the meeting ends because it was left empty
- **THEN** the participant keeps waiting
- **AND** when the moderator comes back and joins, their participants panel lists the participant

### Requirement: Unlocking the room lets everyone in

Turning `access.lock.enabled` off between meetings SHALL let everyone waiting in, each through the usual join checks of `meeting-join`. When they outnumber the free places, the first to connect SHALL stay, whenever they asked, and the others SHALL see "Meeting full".

#### Scenario: Room unlocked between meetings

- **GIVEN** a room with no meeting running and two participants waiting
- **WHEN** its owner calls `updateRoomAccess` with `access.lock.enabled` false
- **THEN** both participants are let in and enter the meeting

#### Scenario: Reconnecting when it is turned off

- **GIVEN** a participant waiting whose connection is down for twenty seconds
- **WHEN** its owner unlocks the room meanwhile and the connection comes back
- **THEN** the participant enters the meeting

#### Scenario: More participants waiting than places

- **GIVEN** a room with `maxParticipants` 2, no meeting running, and Ana, Ben and Zoe waiting in that order
- **WHEN** its owner unlocks the room
- **THEN** two of them enter the meeting and the third sees "Meeting full"

### Requirement: Asking to join from the join screen

When submitting the join screen would make the participant wait, its button SHALL read "Ask to join" and submitting it SHALL start the wait at once, without the device setup screen. The waiting screen SHALL take its place: the participant prepares their camera and microphone there, seeded like the device setup screen (see `meeting-join`), and an admitted participant SHALL join with what it shows.

#### Scenario: Asking from the join screen

- **GIVEN** a locked room and a speaker without `accessBypassLock`
- **WHEN** the speaker submits the join screen with "Ask to join"
- **THEN** they are waiting and the waiting screen shows their camera preview with the device controls, and no device setup screen

#### Scenario: Devices chosen while waiting

- **GIVEN** a participant who turned their camera off on the waiting screen
- **WHEN** a moderator admits them
- **THEN** they join with the camera off

#### Scenario: Joining without waiting

- **GIVEN** a locked room and a moderator holding `accessBypassLock`
- **WHEN** the moderator submits the join screen
- **THEN** its button read "Join Meeting" and the device setup screen opens as usual

#### Scenario: Room locked while choosing devices

- **GIVEN** a speaker without `accessBypassLock` on the device setup screen of a room that was unlocked when they opened it
- **WHEN** the owner locks the room and the speaker presses join
- **THEN** they see the waiting screen with the devices they chose

#### Scenario: Room unlocked before asking

- **GIVEN** a speaker on the join screen whose button reads "Ask to join"
- **WHEN** the owner unlocks the room and the speaker presses it
- **THEN** they enter the meeting without the device setup screen, with the room's initial media settings

### Requirement: The waiting screen

While waiting, the meeting SHALL show that the participant waits to be let in, the room's `access.lock.message`, the camera preview with the device controls, and a "Stop waiting" button. While no meeting runs in the room, it SHALL say that the meeting has not started yet. All of it SHALL update live, at the latest about 20 seconds after a change, the message included when it changes between meetings.

#### Scenario: Someone else admitted

- **GIVEN** Ana and Ben waiting
- **WHEN** Ana is admitted
- **THEN** Ben's waiting screen does not change: it shows no position and nothing about Ana

#### Scenario: Meeting starts

- **GIVEN** a participant waiting in a room with no meeting running
- **WHEN** a moderator holding `accessBypassLock` joins and the meeting starts
- **THEN** the waiting screen stops saying that the meeting has not started yet

#### Scenario: Message changed between meetings

- **GIVEN** a participant waiting in a room with no meeting running
- **WHEN** its owner changes `access.lock.message`
- **THEN** the waiting screen shows the new message

### Requirement: Time waited

While a participant waits, the waiting screen SHALL show how long they have been waiting, in whole minutes from the first minute on, counted from their `knockDate`, which a return to waiting after an admission keeps. Screen readers SHALL NOT announce it as it changes.

#### Scenario: Four minutes waiting

- **GIVEN** a participant who asked to join four minutes ago
- **WHEN** they look at the waiting screen
- **THEN** it says they have been waiting 4 minutes, and a screen reader does not announce the change

### Requirement: Admitted in a background tab

A participant admitted while their page is not visible SHALL join with the microphone off, for that join only.

#### Scenario: Admitted in a background tab

- **GIVEN** a participant waiting with the microphone on, whose waiting page is in a background tab
- **WHEN** a moderator admits them
- **THEN** they join with the microphone off

### Requirement: Waiting with a screen reader

A screen reader SHALL announce that the participant waits once, politely, and their admission or the end of their wait at once, with focus moved to the heading of the screen that reports it. The admitters' notification SHALL never take focus and its actions SHALL be reachable by keyboard, and the status rail chip SHALL be named by the number waiting.

#### Scenario: Rejected with a screen reader

- **GIVEN** a participant waiting with a screen reader
- **WHEN** a moderator denies them
- **THEN** the screen reader announces it at once and focus moves to the heading "You weren't let in"

#### Scenario: Notification while typing

- **GIVEN** a moderator holding `waitingParticipantAdmin` typing a chat message with the participants panel closed
- **WHEN** a participant starts waiting
- **THEN** the notification appears and the focus stays in the chat

### Requirement: A waiting participant learns nothing of the others

A waiting participant SHALL never receive from the locked room the names, identities, externalIds or metadata of the other participants waiting or of the participants in the meeting; reading the meeting is ruled by "Only participants who joined act on the meeting".

#### Scenario: Two participants waiting

- **GIVEN** Ana and Ben waiting
- **WHEN** Ben's meeting receives his waiting state
- **THEN** it holds nothing that identifies Ana, nor how many others wait

### Requirement: Screens after a wait without admission

After a wait ends without admission, the meeting SHALL say why:

- rejected: "You weren't let in", with "Ask to join again";
- left: they stopped waiting;
- meeting ended: it has ended;
- room closed or deleted: that case's error screen;
- expired, or asked again elsewhere: they lost their place, with "Ask to join again";
- full: too many people are waiting, with "Ask to join again".

These screens SHALL offer the end screen's dismiss button (see `meeting-join`).

#### Scenario: Rejected

- **GIVEN** a participant waiting
- **WHEN** a moderator denies them
- **THEN** their meeting says they weren't let in and offers to ask again

#### Scenario: Dismissing in an embedded element

- **GIVEN** an embedded participant shown "You weren't let in"
- **WHEN** they press the dismiss button
- **THEN** the host receives `embeddedCloseRequested`

### Requirement: Holders of waitingParticipantAdmin see who waits

In the meeting, only holders of `waitingParticipantAdmin` SHALL see the waiting list, live from the moment someone asks to join: a "Waiting to join" section atop the participants panel, each row with Deny and Admit and, for a repeated name, the time they asked, and a rail chip with the number waiting. From two waiting it SHALL offer Deny all, rejecting everyone shown after a confirmation, and Admit all (see "Free places in the meeting"). It SHALL catch up within 30 seconds when a notice is lost.

#### Scenario: Section and chip

- **GIVEN** a moderator holding `waitingParticipantAdmin` in a meeting and a speaker without it
- **WHEN** a participant starts waiting
- **THEN** the moderator's participants panel lists them and the status rail shows "1 waiting to join"
- **AND** the speaker sees neither

#### Scenario: Listed before the waiting screen connects

- **GIVEN** a moderator holding `waitingParticipantAdmin` in a meeting
- **WHEN** a participant presses "Ask to join" and their waiting screen has not connected to Meet yet
- **THEN** the moderator's participants panel already lists them

#### Scenario: Deny everyone

- **GIVEN** three participants waiting
- **WHEN** a moderator presses Deny all and confirms
- **THEN** the three are rejected

#### Scenario: Deny all while the list changes

- **GIVEN** three participants waiting and a moderator confirming Deny all
- **WHEN** one of them stops waiting before the moderator confirms
- **THEN** the two still waiting are rejected, and the moderator sees no error and is not asked again

#### Scenario: Two participants with the same name

- **GIVEN** two anonymous participants who both asked to join as "Ana"
- **WHEN** a moderator holding `waitingParticipantAdmin` looks at the panel
- **THEN** each row shows "Ana" with the time that participant asked to join

#### Scenario: Notice of a knock lost

- **GIVEN** a moderator holding `waitingParticipantAdmin` in a meeting
- **WHEN** a participant starts waiting and the notice of that change never reaches the moderator's meeting
- **THEN** within about 30 seconds the moderator's participants panel lists them

### Requirement: Free places in the meeting

Under a participant limit, the "Waiting to join" section SHALL show the free places, which the meeting works out from the room's `maxParticipants` and the participants in the meeting, and SHALL disable Admit all while more participants wait than places are free. A place taken by an admitted participant who has not joined yet is not known to the meeting, so the server's `409` SHALL be told to the moderator as "not everyone fits".

#### Scenario: A place frees up

- **GIVEN** a full meeting and Zoe waiting
- **WHEN** a participant leaves the meeting
- **THEN** within a few seconds the moderator's panel shows one place left and lets them admit Zoe

#### Scenario: More waiting than free places

- **GIVEN** a meeting with two free places and three participants waiting
- **WHEN** a moderator holding `waitingParticipantAdmin` looks at the panel
- **THEN** Admit all is disabled and each row's Admit still works

#### Scenario: Admit all refused after a place was taken

- **GIVEN** a meeting with two free places, two participants waiting, and a holder of `accessBypassLock` joining an instant before a moderator presses Admit all
- **WHEN** the server answers `409` with `error` `not_enough_places`
- **THEN** the moderator's meeting says not everyone fits and both keep waiting

### Requirement: The list follows waitingParticipantAdmin at once

A participant who gains `waitingParticipantAdmin` during the meeting SHALL see the waiting list at once, without waiting for it to change. One who loses it SHALL stop seeing the list, the chip and the notifications, and their host SHALL stop receiving `waitingParticipantListUpdated`, `waitingParticipantKnocked` and the `waitingParticipantStatusChanged` of other waits, at once.

#### Scenario: Promoted during the meeting

- **GIVEN** two participants waiting and a speaker without `waitingParticipantAdmin` in the meeting
- **WHEN** a moderator gives the speaker a role that grants `waitingParticipantAdmin`
- **THEN** the speaker's participants panel lists the two at once

#### Scenario: Demoted during the meeting

- **GIVEN** a moderator holding `waitingParticipantAdmin` whose panel lists two participants waiting
- **WHEN** a manager gives them a role that denies `waitingParticipantAdmin`
- **THEN** the section and the chip disappear at once and a new participant waiting raises no notification for them

### Requirement: Notification of a new participant waiting

While their participants panel is closed, a participant holding `waitingParticipantAdmin` SHALL get a notification for each participant who starts waiting, with Deny and Admit, grouped into one with the number waiting and a View button when several wait. Joining a meeting while participants already wait SHALL show one grouped notification. The notification SHALL sit below the status rail on the top right, and opening the panel SHALL dismiss it.

#### Scenario: Panel closed

- **GIVEN** a moderator holding `waitingParticipantAdmin` with the participants panel closed
- **WHEN** Zoe starts waiting
- **THEN** a notification names Zoe with Deny and Admit, and Admit lets her in

#### Scenario: Panel open

- **GIVEN** a moderator holding `waitingParticipantAdmin` with the participants panel open
- **WHEN** Zoe starts waiting
- **THEN** no notification appears and Zoe is listed in the panel

#### Scenario: Joining with people waiting

- **GIVEN** three participants waiting
- **WHEN** a moderator holding `waitingParticipantAdmin` joins the meeting
- **THEN** one notification says three people are waiting to join

### Requirement: The waiting list in the meeting comes only from the server

A meeting SHALL update the waiting list it shows only from what the server sends. A data message on the same topic from a participant SHALL be ignored, as for every server signal (see `meetings`).

#### Scenario: Forged waiting list

- **GIVEN** a speaker able to send data messages in a meeting
- **WHEN** they publish a message imitating the server's waiting list
- **THEN** no moderator's panel changes

### Requirement: Names in encrypted rooms

In an end-to-end encrypted room, the waiting list in the meeting SHALL show each name as the participants panel shows participants: decrypted when the waiting participant used the viewer's encryption key, masked otherwise, never encrypted. `waitingParticipantList`, the webhooks and the embedded events SHALL carry the name as the participant's client sent it, as `participantJoined` does.

#### Scenario: Same key

- **GIVEN** an encrypted room where a moderator holding `waitingParticipantAdmin` and Ana use the same encryption key
- **WHEN** Ana starts waiting
- **THEN** the moderator's panel and notification name her "Ana"

### Requirement: waitingParticipantKnocked webhook

The server SHALL send the `waitingParticipantKnocked` webhook once each time a participant asks to join and waits, without waiting for their waiting screen to connect, with `roomId`, `roomName` and the participant as `MeetWaitingParticipant`. It SHALL NOT be sent again when the same wait reconnects, nor by another replica. Like every webhook it is not stored: lost if the replica sending it stops, possibly repeated by the retries of `webhooks`, and unordered.

#### Scenario: Knock

- **GIVEN** a registered webhook subscribed to `waitingParticipantKnocked` and scoped to the room
- **WHEN** a participant with `participant-external-id` "u-42" starts waiting
- **THEN** one `waitingParticipantKnocked` webhook is delivered carrying their identity, name, `knockDate`, `type` and `externalId` "u-42"

#### Scenario: Knock on a replica, reconnection on another

- **GIVEN** two replicas and a participant who started waiting through replica A
- **WHEN** their realtime connection drops and reopens through replica B
- **THEN** no second `waitingParticipantKnocked` webhook is delivered

#### Scenario: Knock never followed by a connection

- **GIVEN** a registered webhook subscribed to `waitingParticipantKnocked` and `waitingParticipantStatusChanged`
- **WHEN** a client asks to join and never opens its realtime connection
- **THEN** one `waitingParticipantKnocked` webhook is delivered at once, and within about 20 seconds one `waitingParticipantStatusChanged` webhook with `status` `expired`

### Requirement: waitingParticipantStatusChanged webhook

The server SHALL send the `waitingParticipantStatusChanged` webhook on each change of a wait after it started, with `roomId`, `roomName`, the participant (`MeetWaitingParticipant`, whose `knockDate` with the event's `creationDate` tells how long they waited), `origin` as in `participantHandChanged`, `status` of `MeetWaitingParticipantStatus`, `waiting` only for an admitted participant waiting again, and `reason` of `MeetWaitingParticipantReason` where `status` and `origin` do not tell why.

#### Scenario: Admitted by another moderator

- **GIVEN** a registered webhook subscribed to `waitingParticipantStatusChanged` and a participant who asked to join 90 seconds ago
- **WHEN** a moderator admits them
- **THEN** one `waitingParticipantStatusChanged` webhook is delivered with `status` `admitted`, `origin` `moderator`, their identity and a `knockDate` 90 seconds before the event's `creationDate`

#### Scenario: Page closed for good

- **GIVEN** a registered webhook subscribed to `waitingParticipantStatusChanged` and a participant waiting
- **WHEN** they close the browser tab and do not come back
- **THEN** about a minute later one `waitingParticipantStatusChanged` webhook is delivered with `status` `expired` and `origin` `system`

#### Scenario: Waiter leaves

- **GIVEN** a registered webhook subscribed to `waitingParticipantStatusChanged` and a participant waiting
- **WHEN** they press "Stop waiting"
- **THEN** one `waitingParticipantStatusChanged` webhook is delivered with `status` `left` and `origin` `participant`

### Requirement: waitingParticipantKnocked embedded event

The embedded element of each participant holding `waitingParticipantAdmin` in the meeting SHALL dispatch `waitingParticipantKnocked` once for each participant who starts waiting while it is in the meeting, with `roomId` and the participant as `MeetWaitingParticipant`. Participants already waiting when the element joined SHALL be reported by `waitingParticipantListUpdated`, not by `waitingParticipantKnocked`, and so SHALL a participant waiting again after an admission that failed.

#### Scenario: Knock while in the meeting

- **GIVEN** a host listening to `waitingParticipantKnocked` for a moderator holding `waitingParticipantAdmin` in the meeting
- **WHEN** a participant starts waiting
- **THEN** the host receives one `waitingParticipantKnocked` with that participant

#### Scenario: Speaker's host

- **GIVEN** an embedded speaker without `waitingParticipantAdmin` in the meeting
- **WHEN** a participant starts waiting
- **THEN** the speaker's host receives no `waitingParticipantKnocked`

#### Scenario: Waiting again after a failed admission

- **GIVEN** a host listening to `waitingParticipantKnocked` for a moderator holding `waitingParticipantAdmin`, and Zoe admitted
- **WHEN** Zoe finds the meeting full and waits again
- **THEN** the host receives `waitingParticipantListUpdated` listing Zoe and no `waitingParticipantKnocked`

### Requirement: waitingParticipantListUpdated embedded event

The embedded element of each participant holding `waitingParticipantAdmin` in the meeting of a locked room SHALL dispatch `waitingParticipantListUpdated` with `roomId` and `participants`, the waiting list as `waitingParticipantList` returns it. It SHALL be dispatched once after joining, or after gaining `waitingParticipantAdmin`, and again each time it changes.

#### Scenario: Unlocked room

- **GIVEN** an unlocked room
- **WHEN** an embedded moderator holding `waitingParticipantAdmin` joins the meeting
- **THEN** the host receives no `waitingParticipantListUpdated` and the meeting sends no request for the waiting list

#### Scenario: Someone admitted by another moderator

- **GIVEN** two embedded moderators holding `waitingParticipantAdmin` and Zoe and Ana waiting
- **WHEN** the first moderator admits Zoe
- **THEN** the second moderator's host receives `waitingParticipantListUpdated` with only Ana in `participants`

#### Scenario: Joining with people waiting

- **GIVEN** two participants waiting
- **WHEN** an embedded moderator holding `waitingParticipantAdmin` joins the meeting
- **THEN** the host receives `waitingParticipantListUpdated` listing both and no `waitingParticipantKnocked`

### Requirement: waitingParticipantStatusChanged embedded event

The embedded element of a participant who waits SHALL dispatch `waitingParticipantStatusChanged` with `roomId`, the participant and `status` of `MeetWaitingParticipantStatus`: `waiting` on the first state received and on waiting again after an admission that found the meeting full, and each other value as the wait ends. Every one but `waiting` SHALL carry `origin` and `reason` as the webhook does, when their meeting learned them; no `meetingLeft` is dispatched for a wait.

#### Scenario: Waiting then admitted

- **GIVEN** an embedded participant who asks to join while Ana waits
- **WHEN** Ana is admitted and then they are admitted
- **THEN** the host receives `waitingParticipantStatusChanged` with `waiting` once, nothing when Ana is admitted, then `admitted` with `origin` `moderator`, all with the participant the server answered when they asked, followed by `meetingJoined` with that identity

#### Scenario: Rejected

- **GIVEN** an embedded participant waiting
- **WHEN** a moderator rejects them
- **THEN** the host receives `waitingParticipantStatusChanged` with `rejected` and no `meetingLeft`

#### Scenario: Realtime connection never opens

- **GIVEN** an embedded participant who asks to join and whose realtime connection never receives a message
- **WHEN** the meeting shows the connection error screen
- **THEN** the host receives no `waitingParticipantStatusChanged`

#### Scenario: Admission lost on the way

- **GIVEN** an embedded participant admitted, whose host received `waitingParticipantStatusChanged` with `admitted`
- **WHEN** the answer to their join token request is lost and their meeting says they lost their place
- **THEN** the host receives `waitingParticipantStatusChanged` with `expired` and no `meetingJoined`

### Requirement: waitingParticipantStatusChanged for those who admit

The embedded element of each participant holding `waitingParticipantAdmin` in the meeting SHALL dispatch `waitingParticipantStatusChanged` for every wait of the room, with the same fields and on the same changes as the `waitingParticipantStatusChanged` webhook, whoever caused them.

#### Scenario: Decisions of another moderator

- **GIVEN** two embedded moderators holding `waitingParticipantAdmin` in the meeting and Zoe and Ana waiting
- **WHEN** the first moderator rejects Zoe and admits Ana
- **THEN** the second moderator's host receives `waitingParticipantStatusChanged` with `rejected` for Zoe and `admitted` for Ana, both with `origin` `moderator`

#### Scenario: Speaker in the meeting

- **GIVEN** an embedded speaker without `waitingParticipantAdmin` in the meeting and Zoe waiting
- **WHEN** a moderator admits Zoe
- **THEN** the speaker's host receives no `waitingParticipantStatusChanged`

### Requirement: Commands on waiting participants

`waitingParticipantAdmit`, `waitingParticipantReject` (given a `participantIdentity`) and `waitingParticipantAdmitAll` SHALL run the REST operation of the same name. `waitingParticipantRejectAll` SHALL call `bulkRejectWaitingParticipants` with everyone the meeting shows waiting, nothing when nobody, and SHALL not fail for those who stopped waiting. All four SHALL require `waitingParticipantAdmin` and the local participant in the meeting.

#### Scenario: Admit from the host

- **GIVEN** an embedded moderator holding `waitingParticipantAdmin` in the meeting and Zoe waiting
- **WHEN** the host calls `waitingParticipantAdmit` with Zoe's `participantIdentity`
- **THEN** Zoe enters the meeting

#### Scenario: Admit everyone from the host

- **GIVEN** an embedded moderator holding `waitingParticipantAdmin` in a meeting with two free places, and Zoe and Ana waiting
- **WHEN** the host calls `waitingParticipantAdmitAll`
- **THEN** Zoe and Ana enter the meeting

#### Scenario: Admit everyone when not all fit

- **GIVEN** an embedded moderator holding `waitingParticipantAdmin` in a meeting with one free place, and Zoe and Ana waiting
- **WHEN** the host calls `waitingParticipantAdmitAll`
- **THEN** nobody is admitted and both keep waiting

#### Scenario: Deny everyone from the host

- **GIVEN** an embedded moderator holding `waitingParticipantAdmin` in the meeting, and Zoe and Ana waiting
- **WHEN** the host calls `waitingParticipantRejectAll`
- **THEN** Zoe and Ana are told they weren't let in

#### Scenario: Deny everyone from the host when one already left

- **GIVEN** an embedded moderator holding `waitingParticipantAdmin` whose meeting shows Zoe and Ana waiting, and Ana stopped waiting a moment ago
- **WHEN** the host calls `waitingParticipantRejectAll`
- **THEN** Zoe is told she wasn't let in and the command does not fail

#### Scenario: Deny everyone from the host when nobody waits

- **GIVEN** an embedded moderator holding `waitingParticipantAdmin` in a meeting with nobody waiting
- **WHEN** the host calls `waitingParticipantRejectAll`
- **THEN** the command completes without any request to the server

#### Scenario: Without the permission

- **GIVEN** an embedded speaker without `waitingParticipantAdmin` and Zoe waiting
- **WHEN** the host calls `waitingParticipantReject` with Zoe's `participantIdentity`
- **THEN** the command is rejected and Zoe keeps waiting

### Requirement: The host of a waiting participant

While the local participant waits, `mediaToggleAudio` and `mediaToggleVideo` SHALL act on the camera preview and microphone as on the device setup screen, and `meetingLeave` SHALL stop the wait, dispatching `waitingParticipantStatusChanged` with `left`.

#### Scenario: Leave command while waiting

- **GIVEN** an embedded participant waiting
- **WHEN** the host calls `meetingLeave()`
- **THEN** the participant stops waiting, `waitingParticipantList` no longer lists them, and the host receives `waitingParticipantStatusChanged` with `left`

#### Scenario: Leave command and removal at once

- **GIVEN** an embedded participant waiting
- **WHEN** the host calls `meetingLeave()` and removes the element right after
- **THEN** `waitingParticipantList` no longer lists them and a `waitingParticipantStatusChanged` webhook with `left` is sent

#### Scenario: Camera off while waiting

- **GIVEN** an embedded participant waiting with the camera on
- **WHEN** the host calls `mediaToggleVideo(false)`
- **THEN** the preview turns off, and the participant joins with the camera off once admitted

### Requirement: Locked room in the room wizard

The Room Access step of the console room wizard SHALL hold a "Locked room" section with a switch for `access.lock.enabled` and a field for `access.lock.message`. The field SHALL be shown only while the switch is on. Each role SHALL get a "Join a locked room" switch for `accessBypassLock` and an "Admit participants" switch for `waitingParticipantAdmin`, in a "Locked room" permission group.

#### Scenario: Creating a locked room

- **GIVEN** the wizard
- **WHEN** the user turns "Locked room" on, writes a message and finishes
- **THEN** the new room has `access.lock.enabled` true and that `access.lock.message`

### Requirement: Waiting participants in the meeting read

`meetingGet` called with the extra field `waitingParticipants` (see `meetings`) SHALL carry in `waitingParticipants` the participants `waitingParticipantList` returns, only for a caller that also holds `waitingParticipantAdmin`. For any other caller the request SHALL answer as it does without that extra field, leaving `waitingParticipants` out. Without a meeting `meetingGet` SHALL keep answering `404`, whoever waits.

#### Scenario: Caller holding the permission

- **GIVEN** a locked room with a meeting running and Ana waiting
- **WHEN** a client holding `meetingRead` and `waitingParticipantAdmin` calls `meetingGet` with `extraFields=waitingParticipants`
- **THEN** `waitingParticipants` holds Ana, as `waitingParticipantList` returns her

#### Scenario: Caller without the permission

- **GIVEN** a locked room with a meeting running and Ana waiting
- **WHEN** a participant in the meeting whose room member token holds `meetingRead` but not `waitingParticipantAdmin` calls `meetingGet` with `extraFields=participants,waitingParticipants`
- **THEN** the request answers 200 with `participants`
- **AND** the response carries no `waitingParticipants`

#### Scenario: API key

- **GIVEN** a locked room with a meeting running and Ana waiting
- **WHEN** a backend calls `meetingGet` with the API key and `extraFields=waitingParticipants`
- **THEN** `waitingParticipants` holds Ana

#### Scenario: Unlocked room

- **GIVEN** an unlocked room with a meeting running
- **WHEN** a client holding `meetingRead` and `waitingParticipantAdmin` calls `meetingGet` with `extraFields=waitingParticipants`
- **THEN** `waitingParticipants` is an empty list

#### Scenario: Waiting before the meeting starts

- **GIVEN** a locked room with no meeting running and Ana waiting
- **WHEN** a backend calls `meetingGet` with the API key and `extraFields=waitingParticipants`
- **THEN** the request answers 404 stating the room has no active meeting
- **AND** `waitingParticipantList` returns Ana
