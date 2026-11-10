## Purpose

The waiting room holds the participants of a room who ask to join until a holder of `lobbyAdmin` admits or rejects them. Participants, holders of `lobbyAdmin`, host applications, REST clients and webhook receivers rely on it.

## ADDED Requirements

### Requirement: The waiting room is turned on per room
The room config field `lobby.enabled` SHALL decide whether a room holds participants who ask to join, `false` by default. The optional `lobby.message`, up to 500 characters, SHALL be shown to the participants while they wait. Like the rest of the config, `lobby` SHALL NOT change while a meeting runs (see `room-config`), and the meeting SHALL offer no way to turn the waiting room off.

#### Scenario: Room created without the waiting room
- **WHEN** a client creates a room without `config.lobby`
- **THEN** `getRoomConfig` returns `lobby.enabled` false and every participant joins directly

#### Scenario: Message too long
- **WHEN** a client calls `updateRoomConfig` with a `lobby.message` of 501 characters
- **THEN** the server answers `422` and the config is unchanged

#### Scenario: Turning it off during a meeting
- **GIVEN** a room with the waiting room on and a meeting running
- **WHEN** its owner calls `updateRoomConfig` with `lobby.enabled` false
- **THEN** the server answers `409` and the waiting room stays on

### Requirement: Who waits
In a room with `lobby.enabled`, a participant who asks to join SHALL wait instead of joining, unless they hold `lobbyBypass`. An admitted participant who reloads the page SHALL ask again and wait. An admin and the room's owner hold every permission and SHALL join directly. The server checks of `meeting-join` SHALL run before a participant waits, except the participant limit, which applies when their join token is issued. Gaining `lobbyBypass` while waiting SHALL NOT end the wait.

#### Scenario: Speaker waits
- **GIVEN** a room with the waiting room on whose speaker role denies `lobbyBypass`
- **WHEN** a participant with the anonymous speaker link presses "Ask to join"
- **THEN** they see the waiting screen and do not enter the meeting

#### Scenario: Moderator joins directly
- **GIVEN** a room with the waiting room on whose moderator role grants `lobbyBypass`
- **WHEN** a participant with the anonymous moderator link presses join
- **THEN** they enter the meeting

#### Scenario: Admitted member reloads
- **GIVEN** a member without `lobbyBypass` who was admitted and is in the meeting
- **WHEN** they reload the page and ask to join again
- **THEN** they wait at the end of the line

#### Scenario: Granted lobbyBypass while waiting
- **GIVEN** a member waiting in a room with the waiting room on
- **WHEN** a manager grants their role `lobbyBypass`
- **THEN** they keep waiting until a holder of `lobbyAdmin` admits them

#### Scenario: Closed room
- **GIVEN** a closed room with the waiting room on
- **WHEN** a speaker asks to join
- **THEN** the server answers `409` and the "Closed room" error screen is shown, as without the waiting room

### Requirement: Asking to join gives a waiting ticket, not a token
Asking to join a room where the participant waits SHALL answer with a waiting ticket and their identity, not a token. The ticket SHALL serve only its own wait: the realtime connection that keeps the place, the join token once admitted, and leaving. It SHALL last as long as the wait, without renewal, and give no access to the meeting's media or API. Asking SHALL NOT start the meeting, reserve the name or take a place in it. The identity SHALL be the one kept once admitted (see `meetings`).

#### Scenario: Waiter knows its identity
- **GIVEN** a participant with the anonymous speaker link of a room with the waiting room on
- **WHEN** they ask to join and wait
- **THEN** the answer carries the waiting ticket and the identity that `lobbyList` lists and `participantJoined` reports after their admission

#### Scenario: Room stays open
- **GIVEN** an open room with the waiting room on and no meeting running
- **WHEN** a speaker asks to join and waits
- **THEN** the room status stays `open` and no `meetingStarted` webhook is sent

#### Scenario: Waiting while the meeting is full
- **GIVEN** a room with the waiting room on and `maxParticipants` 2, whose meeting holds 2 participants
- **WHEN** a third participant asks to join
- **THEN** they wait

#### Scenario: Waiting holder of lobbyAdmin
- **GIVEN** a room with the waiting room on and a member granted `lobbyAdmin` and denied `lobbyBypass`, waiting
- **WHEN** their client calls `lobbyList`, or `lobbyAdmit` with their own identity
- **THEN** the server refuses it and they keep waiting

#### Scenario: Waiting holder of meetingEnd
- **GIVEN** a member granted `meetingEnd` and denied `lobbyBypass`, waiting while a meeting runs
- **WHEN** their client calls `meetingEnd`
- **THEN** the server refuses it and the meeting goes on

#### Scenario: Long wait
- **GIVEN** a participant waiting with a steady connection
- **WHEN** three hours pass before a moderator admits them
- **THEN** they join the meeting

### Requirement: A place in line lasts while the participant stays in touch
A participant SHALL start waiting when they ask to join, and keep their place only while their meeting client stays connected to Meet through its realtime connection, whichever replica it reaches (see `deployment`); one whose client never connects SHALL lose it within about 20 seconds of asking. Leaving the waiting room, from its button or with `meetingLeave`, SHALL end the wait at once, even while the realtime connection is down.

#### Scenario: Asking without ever connecting
- **GIVEN** a client that asks to join and never opens its realtime connection
- **WHEN** 20 seconds pass
- **THEN** `lobbyList` no longer lists it

#### Scenario: Leaving the waiting room
- **GIVEN** a participant waiting
- **WHEN** they press "Leave waiting room"
- **THEN** `lobbyList` no longer lists them

#### Scenario: Leaving while reconnecting
- **GIVEN** a participant waiting whose realtime connection is being restored after a network change
- **WHEN** they press "Leave waiting room"
- **THEN** `lobbyList` no longer lists them and a `lobbyStatusChanged` webhook with `left` is sent

#### Scenario: Replica stops
- **GIVEN** two replicas and a participant waiting whose realtime connection is held by replica A
- **WHEN** replica A stops and the client reconnects through replica B
- **THEN** the participant keeps their place in line

### Requirement: A minute without the connection loses the place
A participant whose realtime connection has been down for about a minute, whatever the reason (network loss, closed or reloaded page, a phone suspending the page, an embedded element or iframe removed by its host), SHALL lose their place and their wait SHALL end as expired, never as left, which only leaving reports. Their meeting SHALL then stop reconnecting, say they lost their place and offer to ask again, or show the connection error screen if it never reached Meet during that wait.

#### Scenario: Short network loss
- **GIVEN** a participant second in line
- **WHEN** their connection drops and comes back 20 seconds later
- **THEN** they are still second in line and no new `participantKnocked` webhook is sent

#### Scenario: Page closed
- **GIVEN** a participant waiting
- **WHEN** they close the browser tab
- **THEN** `lobbyList` stops listing them within about a minute and one `lobbyStatusChanged` webhook with `expired` is sent

#### Scenario: Network lost for two minutes
- **GIVEN** a participant second in line
- **WHEN** their device loses its network for two minutes
- **THEN** `lobbyList` stops listing them within about a minute of the loss
- **AND** their meeting says they lost their place and offers to ask again, which puts them at the end of the line

#### Scenario: Host removes the embedded element
- **GIVEN** an embedded participant waiting, through the web component or through an iframe
- **WHEN** the host application removes the element or the iframe
- **THEN** `lobbyList` stops listing them within about a minute, with a `lobbyStatusChanged` webhook with `expired`, not `left`

#### Scenario: Realtime connection blocked
- **GIVEN** a network that blocks the realtime connection to Meet
- **WHEN** a participant asks to join
- **THEN** about a minute later their meeting shows the connection error screen, not that they lost their place

### Requirement: Every request to join is a new wait
Each time a participant asks to join, it SHALL start a new wait at the end of the line. When the same identity already waits (a member or a user asking again from a reload, another tab or another device), the earlier wait SHALL end as left and the earlier screen, if still open, SHALL say they lost their place.

#### Scenario: Member asks from a second device
- **GIVEN** a member waiting first in line on a laptop, with Ben behind them
- **WHEN** they ask to join the same room from a phone
- **THEN** the phone shows them second in line, behind Ben
- **AND** the laptop says they lost their place
- **AND** `lobbyList` lists them once

#### Scenario: Reload while waiting
- **GIVEN** a member waiting first in line, with Ben behind them
- **WHEN** they reload the page and ask to join again
- **THEN** they wait behind Ben, and a `participantKnocked` webhook is sent for the new wait

### Requirement: Waiting list
`GET /api/v1/meetings/{roomId}/lobby` (`lobbyList`) SHALL require `lobbyAdmin` (`403`) and return `participants`, those waiting as `MeetLobbyParticipant` in arrival order (`knockDate`, then identity), and `availablePlaces`, the free places: `maxParticipants` minus the participants connected and those admitted who have not joined yet, never below 0, or `null` without a limit. Unlike the other meeting operations, the waiting room operations SHALL answer whether or not a meeting runs.

#### Scenario: Two participants waiting
- **GIVEN** Ana asked to join before Ben
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** `participants` holds Ana and then Ben, each with their identity, name and `knockDate`

#### Scenario: Waiting before the meeting starts
- **GIVEN** a room with no meeting running and a participant waiting
- **WHEN** a backend calls `lobbyList` with the API key
- **THEN** it returns that participant

#### Scenario: Without the permission
- **GIVEN** a room member token without `lobbyAdmin`
- **WHEN** its holder calls `lobbyList`
- **THEN** the server answers `403`

#### Scenario: Free places
- **GIVEN** a room with `maxParticipants` 4 and a meeting with two participants connected
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** `availablePlaces` is 2

#### Scenario: Admitted participant on the way in
- **GIVEN** a room with `maxParticipants` 4, two participants connected and Ana admitted, who has not joined yet
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** `availablePlaces` is 1, and it is 2 again a minute after her admission if she has not joined
- **AND** it stays 1 once she joins, since she then counts as connected only

#### Scenario: Meeting at its limit
- **GIVEN** a room with `maxParticipants` 2, two participants connected and Ana admitted, who has not joined yet, because a holder of `lobbyBypass` took the place meanwhile
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** `availablePlaces` is 0, never negative

#### Scenario: No participant limit
- **GIVEN** a room without `maxParticipants` and a participant waiting
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** `availablePlaces` is `null`

### Requirement: Limit on the waiting list
A room SHALL hold at most 100 participants waiting: one more asking to join SHALL be refused with `409` and see that the waiting room is full.

#### Scenario: Waiting room full
- **GIVEN** a room with 100 participants waiting
- **WHEN** another participant asks to join
- **THEN** the server answers `409` and they see that the waiting room is full

### Requirement: The waiting list tells how each participant came
Each `MeetLobbyParticipant` SHALL carry a `type` the server derives from the credential of the request: `user` for a participant who asked with their own Meet account, `identified_guest` for one who asked with their personal member link, `anonymous` for one who asked with a shared link of the room. The participants panel SHALL mark each `anonymous` row.

#### Scenario: Shared link
- **GIVEN** a participant who asked to join with the room's anonymous speaker link
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** their entry has `type` `anonymous` and the panel marks their row

#### Scenario: Account and personal link
- **GIVEN** a user waiting with their own account and an identified guest waiting with their personal link
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** the entries have `type` `user` and `identified_guest`, and the panel marks neither row

#### Scenario: Name chosen by the participant
- **GIVEN** an anonymous participant who typed the name "Dr. Ruiz"
- **WHEN** a moderator looks at the panel
- **THEN** the row reads "Dr. Ruiz" with the "Shared link" marker

### Requirement: The correlation fields prove nothing
The `externalId` and `metadata` of a `MeetLobbyParticipant` SHALL be what the participant's client sent, never verified. A backend that admits on its own SHALL identify a waiting participant by `type` and by the `participantIdentity` of a member or user, which the server derives from their personal link or account.

#### Scenario: Forged external id
- **GIVEN** a room's anonymous speaker link
- **WHEN** a participant opens it with `participant-external-id` "u-42" and asks to join
- **THEN** `lobbyList` lists them with `externalId` "u-42", `type` `anonymous` and an identity the server generated

### Requirement: Admit or reject participants
`POST /api/v1/meetings/{roomId}/lobby/admit` (`lobbyAdmit`) and `POST /api/v1/meetings/{roomId}/lobby/reject` (`lobbyReject`) SHALL admit or reject the waiting participants named by `participantIdentities`, one or several, and answer with the participants decided on as `MeetLobbyParticipant`. Both SHALL require `lobbyAdmin` (`403`), and a decision on named participants at least one identity, each named once (`422`): a missing or empty `participantIdentities` SHALL never mean everyone waiting.

#### Scenario: Admitting one
- **GIVEN** a participant waiting
- **WHEN** a moderator holding `lobbyAdmin` calls `lobbyAdmit` with their identity
- **THEN** the server answers `200` and the participant enters the meeting

#### Scenario: Admitting the three shown
- **GIVEN** three participants waiting, shown to a moderator as "Admit 3"
- **WHEN** a fourth participant starts waiting and the moderator presses "Admit 3"
- **THEN** the three shown enter the meeting and the fourth keeps waiting

#### Scenario: No identity
- **WHEN** a client holding `lobbyAdmin` calls `lobbyAdmit` with an empty `participantIdentities`
- **THEN** the server answers `422`

#### Scenario: Same identity twice
- **WHEN** a client holding `lobbyAdmin` calls `lobbyReject` naming the same identity twice
- **THEN** the server answers `422` and nobody is rejected

### Requirement: A decision on named participants applies to all of them or to none
`lobbyAdmit` and `lobbyReject` with `participantIdentities` SHALL change nothing and answer `404` when one of them is not waiting, and `lobbyAdmit` SHALL admit nobody and answer `409` when they outnumber the free places, which count the admitted participants who have not joined yet (see "Waiting list"). Decisions SHALL apply one at a time across replicas, so two admissions for the last place give one success and one `409`.

#### Scenario: One of them no longer waits
- **GIVEN** Ana and Ben waiting, and Ben leaves the waiting room
- **WHEN** a client holding `lobbyAdmin` calls `lobbyReject` with Ana's and Ben's identities
- **THEN** the server answers `404` and Ana keeps waiting

#### Scenario: Not enough places
- **GIVEN** a meeting with two free places and three participants waiting
- **WHEN** a client calls `lobbyAdmit` with the three identities
- **THEN** the server answers `409` and the three keep waiting

#### Scenario: Last free place
- **GIVEN** a meeting with `maxParticipants` 3, two participants connected and Ana and Ben waiting
- **WHEN** a moderator admits Ana and, before she appears in the meeting, admits Ben
- **THEN** the first admission answers `200` and the second `409`, and Ben keeps waiting
- **AND** `availablePlaces` is 0 until she appears in the meeting

#### Scenario: Admitting on two replicas
- **GIVEN** two replicas, a meeting with one free place and two participants waiting
- **WHEN** two moderators admit one each at the same time, through different replicas
- **THEN** one admission answers `200` and the other `409`, one participant enters and the other keeps waiting

#### Scenario: Admitted participant who never comes
- **GIVEN** a meeting with `maxParticipants` 3, two participants connected, Ana admitted who closes her page, and Ben waiting
- **WHEN** a minute passes after Ana's admission and a moderator admits Ben
- **THEN** the server answers `200` and Ben enters the meeting

### Requirement: Deciding on everyone waiting
With `all` set to `true` instead of `participantIdentities`, `lobbyAdmit` SHALL admit the participants waiting in arrival order up to the free places (see "Waiting list") and leave the rest waiting in their place, and `lobbyReject` SHALL reject, in one atomic step, everyone waiting at that moment. Both SHALL answer with the participants decided on, none when nobody waits or no place is free, and `422` for both or neither of the two fields.

#### Scenario: Fewer free places than participants waiting
- **GIVEN** a meeting with two free places and Ana, Ben and Zoe waiting, in that order
- **WHEN** a client holding `lobbyAdmin` calls `lobbyAdmit` with `all` true
- **THEN** the server answers `200` with Ana and Ben, who enter the meeting
- **AND** Zoe keeps waiting, first in line

#### Scenario: Admitted participant on the way in
- **GIVEN** a meeting with two free places, Ana admitted who has not joined yet, and Ben and Zoe waiting in that order
- **WHEN** a client holding `lobbyAdmin` calls `lobbyAdmit` with `all` true
- **THEN** the server answers `200` with Ben alone and Zoe keeps waiting, first in line

#### Scenario: Admitting all without a participant limit
- **GIVEN** a room without `maxParticipants` and three participants waiting
- **WHEN** a client holding `lobbyAdmin` calls `lobbyAdmit` with `all` true
- **THEN** the three enter the meeting

#### Scenario: Rejecting everyone waiting
- **GIVEN** Ana and Ben waiting
- **WHEN** a client holding `lobbyAdmin` calls `lobbyReject` with `all` true
- **THEN** the server answers `200` with Ana and Ben, and both are told they weren't let in

#### Scenario: Asking right after everyone was rejected
- **GIVEN** three participants waiting
- **WHEN** a client calls `lobbyReject` with `all` true and Zoe asks to join right after it answers
- **THEN** the three are rejected and Zoe waits, shown to the holders of `lobbyAdmin` as any new participant waiting

### Requirement: One decision per participant across replicas
Decisions on the same waiting participant SHALL apply one at a time across every replica: the first one SHALL apply, and a later decision naming them SHALL answer `404` and a later one with `all` SHALL leave them out, since the participant no longer waits.

#### Scenario: Admit and reject at once on two replicas
- **GIVEN** two replicas sharing Redis and a participant waiting
- **WHEN** one moderator admits them through replica A while another rejects them through replica B
- **THEN** one request answers `200`, the other `404`, and the participant is either admitted or rejected, not both

### Requirement: Admitted participants join with the identity they waited with
An admitted participant's meeting SHALL join without reloading the page, keeping the devices chosen, with the identity they waited with. The server SHALL issue their join token only after admission, applying at that moment the checks of `meeting-join`. Asking for the join token with the waiting ticket before admission SHALL keep the participant waiting with the same identity and place, and so SHALL finding the meeting full once admitted.

#### Scenario: Admitted participant appears in the meeting
- **GIVEN** a participant waiting with identity `ana-x1`
- **WHEN** they are admitted
- **THEN** the `participantJoined` webhook reports identity `ana-x1`

#### Scenario: Admission starts the meeting
- **GIVEN** an open room with no meeting running and a participant waiting
- **WHEN** a backend admits them with the API key
- **THEN** they join and the room status becomes `active_meeting`

#### Scenario: Asking again before admission
- **GIVEN** a participant second in line
- **WHEN** their client asks for the join token with the waiting ticket
- **THEN** they are still waiting, second in line, with the same identity

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
- **AND** `lobbyList` does not list them and no new `participantKnocked` webhook is sent

#### Scenario: Laptop asleep for an hour
- **GIVEN** a participant whose laptop slept for an hour while waiting
- **WHEN** the laptop wakes up
- **THEN** their meeting says they lost their place and offers to ask again, without putting them back in line

#### Scenario: Decision message lost
- **GIVEN** a participant waiting whose realtime connection stays up
- **WHEN** a moderator rejects them and the message carrying the rejection never reaches them
- **THEN** within about 20 seconds their meeting says they weren't let in

#### Scenario: Replaying the ticket after a kick
- **GIVEN** a speaker without `lobbyBypass` who was admitted, joined the meeting and was kicked
- **WHEN** their client asks for a join token with the waiting ticket of that admission
- **THEN** the server answers `409` and issues no token

### Requirement: What happens when an admission cannot complete
An admitted participant who finds the meeting full when asking for their join token SHALL go back to their earlier place in line. One whose meeting then fails to connect SHALL see the meeting's connection error or "Meeting full" screen and SHALL ask again to come back. A closed room SHALL end the wait with the "Closed room" screen; withdrawn access SHALL show that access error screen while the admission expires.

#### Scenario: Meeting full at the admission
- **GIVEN** Ana admitted first in line, and the last free place taken by a holder of `lobbyBypass` before she asks for her join token
- **WHEN** her meeting asks to join
- **THEN** she is back first in line and `lobbyList` lists her under `participants`

#### Scenario: Media server refuses the admitted participant
- **GIVEN** Ana admitted, whose join token was issued and whose connection to the meeting's media keeps failing
- **WHEN** her meeting gives up joining
- **THEN** she sees the connection error screen and `lobbyList` does not list her
- **AND** her place counts as taken until a minute after her admission

#### Scenario: Rejected after an admission that did not complete
- **GIVEN** a member admitted who found the meeting full and is back in line
- **WHEN** a moderator rejects them and they reload and ask to join again
- **THEN** they wait at the end of the line

#### Scenario: Room closed before joining
- **GIVEN** a participant admitted to an open room with no meeting running
- **WHEN** the room is closed before their meeting asks for their join token
- **THEN** their wait ends and the "Closed room" error screen is shown

### Requirement: An admission holds its place until the participant joins
An admitted participant SHALL count as a taken place from their admission until LiveKit reports their identity in the room, and for one minute at most. An admission not used within that minute SHALL end as expired, from the server's own rule, and its place SHALL be released. Getting the join token SHALL NOT release the place. A participant counted both as connected and as admitted SHALL only make the free places lower, never higher.

#### Scenario: Admission never used
- **GIVEN** a meeting with `maxParticipants` 3, two participants connected and Ana admitted, who closes her page
- **WHEN** a minute passes after her admission
- **THEN** `availablePlaces` is 1 again and her wait ends with a `lobbyStatusChanged` webhook with `expired`
- **AND** a script that keeps its connection open without asking for the join token loses the place the same way

#### Scenario: Participant joins
- **GIVEN** a meeting with `maxParticipants` 4, two participants connected and Ana admitted, whose join token was issued
- **WHEN** LiveKit reports Ana in the room
- **THEN** her place stops counting at once and `availablePlaces` is 1

#### Scenario: Joined notice lost
- **GIVEN** an admitted participant who joined the meeting, whose joined notice never reaches Meet
- **WHEN** a minute passes after their admission
- **THEN** their place stops counting and no `lobbyStatusChanged` webhook with `expired` is sent

#### Scenario: Notice reaches another replica
- **GIVEN** two replicas, Ana admitted through replica A, and LiveKit's joined notice for Ana handled by replica B
- **WHEN** a moderator calls `lobbyList` through replica A
- **THEN** her place no longer counts

### Requirement: Only participants let in reach the meeting
In a room with the waiting room on, a join token SHALL be issued only to a holder of `lobbyBypass` or to an admitted participant, and turning the waiting room on SHALL invalidate every room member token issued before (see `authentication`). A join token SHALL then connect to the room's media until it expires, its holder is kicked (see `meeting-moderation`), or a later change invalidates it (see `authentication`). A participant already in the meeting who loses `lobbyBypass` stays in it.

#### Scenario: Token from before the waiting room
- **GIVEN** a speaker who joined a meeting while the room had the waiting room off and kept their join token
- **WHEN** the owner turns the waiting room on and the speaker connects to the room's next meeting with that token
- **THEN** they are removed at once, and asking to join again makes them wait

### Requirement: Only participants who joined act on the meeting
In a room with the waiting room on, a room member token without a participant identity, one obtained without joining, SHALL hold for every server check only `recordingList`, `recordingPlay`, `recordingDownload`, `recordingDelete` and `roomShareAccessLinks`: every operation gated by another permission, such as `meetingRead`, `meetingEnd`, a participant permission, `recordingControl`, `broadcastControl`, `broadcastEdit` or `lobbyAdmin`, SHALL answer `403`. API keys SHALL keep their access.

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
- **GIVEN** a member granted `lobbyAdmin` and denied `lobbyBypass`, waiting
- **WHEN** they obtain a token without joining and call `lobbyAdmit` with their own identity
- **THEN** the server answers `403` and they keep waiting

#### Scenario: Moderator demoted during the meeting
- **GIVEN** a moderator who joined without waiting and was demoted to a speaker role granting `meetingRead`
- **WHEN** their client calls `participantList`
- **THEN** the server answers `200`

#### Scenario: Recordings of the room
- **GIVEN** a token obtained without joining, granting `recordingList`
- **WHEN** its holder calls `recordingList` for the room
- **THEN** the server answers `200`

### Requirement: Rejected participants may ask again
A rejected participant SHALL leave the waiting list and be told they were not let in. Their screen SHALL offer "Ask to join again", disabled for the 15 seconds after the rejection; asking again starts a new wait at the end of the line.

#### Scenario: Pause after a rejection
- **GIVEN** a participant rejected five seconds ago
- **WHEN** they look at their screen
- **THEN** "Ask to join again" is disabled, and it becomes enabled 15 seconds after the rejection

#### Scenario: Asking again after a rejection
- **GIVEN** a participant who was rejected 20 seconds ago while Ben waits
- **WHEN** they press "Ask to join again"
- **THEN** they wait behind Ben

### Requirement: What ends a wait without a decision
A wait SHALL end, telling the participant why, when the meeting running in the room is ended on purpose (from the meeting, the embedded API or the REST API, or by its duration limit), when the room is closed or deleted, from the moment it actually closes, and when the participant leaves the waiting room. A participant who asks to join after a meeting ended SHALL wait for the next one.

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
- **THEN** the participant keeps waiting in their place
- **AND** when the moderator comes back and joins, their participants panel lists the participant

### Requirement: Turning the waiting room off lets everyone in
Turning `lobby.enabled` off between meetings SHALL let everyone waiting in, each through the usual join checks of `meeting-join`. When they outnumber the free places, the first to connect SHALL stay, whatever their place in line, and the others SHALL see "Meeting full".

#### Scenario: Waiting room turned off between meetings
- **GIVEN** a room with no meeting running and two participants waiting
- **WHEN** its owner calls `updateRoomConfig` with `lobby.enabled` false
- **THEN** both participants are let in and enter the meeting

#### Scenario: Reconnecting when it is turned off
- **GIVEN** a participant waiting whose connection is down for twenty seconds
- **WHEN** its owner turns the waiting room off meanwhile and the connection comes back
- **THEN** the participant enters the meeting

#### Scenario: More participants waiting than places
- **GIVEN** a room with `maxParticipants` 2, no meeting running, and Ana, Ben and Zoe waiting in that order
- **WHEN** its owner turns the waiting room off
- **THEN** two of them enter the meeting and the third sees "Meeting full"

### Requirement: Asking to join from the join screen
When submitting the join screen would make the participant wait, its button SHALL read "Ask to join" and submitting it SHALL start the wait at once, without the device setup screen. The waiting screen SHALL take its place: the participant prepares their camera and microphone there, seeded like the device setup screen (see `meeting-join`), and an admitted participant SHALL join with what it shows.

#### Scenario: Asking from the join screen
- **GIVEN** a room with the waiting room on and a speaker without `lobbyBypass`
- **WHEN** the speaker submits the join screen with "Ask to join"
- **THEN** they are in line and the waiting screen shows their camera preview with the device controls, and no device setup screen

#### Scenario: Devices chosen while waiting
- **GIVEN** a participant who turned their camera off on the waiting screen
- **WHEN** a moderator admits them
- **THEN** they join with the camera off

#### Scenario: Joining without waiting
- **GIVEN** a room with the waiting room on and a moderator holding `lobbyBypass`
- **WHEN** the moderator submits the join screen
- **THEN** its button read "Join Meeting" and the device setup screen opens as usual

#### Scenario: Waiting room turned on while choosing devices
- **GIVEN** a speaker without `lobbyBypass` on the device setup screen of a room whose waiting room was off when they opened it
- **WHEN** the owner turns the waiting room on and the speaker presses join
- **THEN** they see the waiting screen with the devices they chose

#### Scenario: Waiting room turned off before asking
- **GIVEN** a speaker on the join screen whose button reads "Ask to join"
- **WHEN** the owner turns the waiting room off and the speaker presses it
- **THEN** they enter the meeting without the device setup screen, with the room's initial media settings

### Requirement: The waiting screen
While waiting, the meeting SHALL show the participant's position in line, the room's `lobby.message`, the camera preview with the device controls, and a "Leave waiting room" button. While no meeting runs in the room, it SHALL say that the meeting has not started yet. All of it SHALL update live, at the latest about 20 seconds after a change, the message included when it changes between meetings.

#### Scenario: Position moves up
- **GIVEN** Ana and Ben waiting, in that order
- **WHEN** Ana is admitted
- **THEN** Ben's waiting screen says he is first in line

#### Scenario: Meeting starts
- **GIVEN** a participant waiting in a room with no meeting running
- **WHEN** a moderator holding `lobbyBypass` joins and the meeting starts
- **THEN** the waiting screen stops saying that the meeting has not started yet

#### Scenario: Message changed between meetings
- **GIVEN** a participant waiting in a room with no meeting running
- **WHEN** its owner changes `lobby.message`
- **THEN** the waiting screen shows the new message

### Requirement: Time waited
While a participant waits, the waiting screen SHALL show how long they have been waiting, in whole minutes from the first minute on, counted from their `knockDate`, which a return to the line keeps. Screen readers SHALL NOT announce it as it changes.

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

### Requirement: The waiting room with a screen reader
A screen reader SHALL announce a waiter's position politely, at most once every 10 seconds, and their admission or the end of their wait at once, with focus moved to the heading of the screen that reports it. The admitters' notification SHALL never take focus and its actions SHALL be reachable by keyboard, and the status rail chip SHALL be named by the number waiting.

#### Scenario: Rejected with a screen reader
- **GIVEN** a participant waiting with a screen reader
- **WHEN** a moderator denies them
- **THEN** the screen reader announces it at once and focus moves to the heading "You weren't let in"

#### Scenario: Notification while typing
- **GIVEN** a moderator holding `lobbyAdmin` typing a chat message with the participants panel closed
- **WHEN** a participant starts waiting
- **THEN** the notification appears and the focus stays in the chat

### Requirement: A waiting participant learns nothing of the others
A waiting participant SHALL never receive from the waiting room the names, identities, externalIds or metadata of the other participants waiting or of the participants in the meeting; reading the meeting is ruled by "Only participants who joined act on the meeting".

#### Scenario: Two participants waiting
- **GIVEN** Ana and Ben waiting
- **WHEN** Ben's meeting receives his waiting state
- **THEN** it holds his position and nothing that identifies Ana

### Requirement: Screens after a wait without admission
After a wait ends without admission, the meeting SHALL say why:
- rejected: "You weren't let in", with "Ask to join again";
- left: they left the waiting room;
- meeting ended: it has ended;
- room closed or deleted: that case's error screen;
- expired, or asked again elsewhere: they lost their place, with "Ask to join again";
- full: the waiting room is full, with "Ask to join again".

These screens SHALL offer the end screen's dismiss button (see `meeting-join`).

#### Scenario: Rejected
- **GIVEN** a participant waiting
- **WHEN** a moderator denies them
- **THEN** their meeting says they weren't let in and offers to ask again

#### Scenario: Dismissing in an embedded element
- **GIVEN** an embedded participant shown "You weren't let in"
- **WHEN** they press the dismiss button
- **THEN** the host receives `embeddedCloseRequested`

### Requirement: Holders of lobbyAdmin see who waits
In the meeting, only holders of `lobbyAdmin` SHALL see the waiting list, live from the moment someone asks to join, in arrival order: a "Waiting to join" section atop the participants panel, each row with Deny and Admit and, for a repeated name, its arrival time, and a rail chip with the number waiting. It SHALL show the free places under a limit and, from two waiting, Deny all after a confirmation and "Admit N" for the first N that fit, catching up within 30 seconds when a notice is lost.

#### Scenario: Section and chip
- **GIVEN** a moderator holding `lobbyAdmin` in a meeting and a speaker without it
- **WHEN** a participant starts waiting
- **THEN** the moderator's participants panel lists them and the status rail shows "1 waiting to join"
- **AND** the speaker sees neither

#### Scenario: Listed before the waiting screen connects
- **GIVEN** a moderator holding `lobbyAdmin` in a meeting
- **WHEN** a participant presses "Ask to join" and their waiting screen has not connected to Meet yet
- **THEN** the moderator's participants panel already lists them

#### Scenario: Deny everyone
- **GIVEN** three participants waiting
- **WHEN** a moderator presses Deny all and confirms
- **THEN** the three are rejected

#### Scenario: Deny all while the line changes
- **GIVEN** three participants waiting and a moderator confirming Deny all
- **WHEN** one of them leaves before the moderator confirms
- **THEN** the two still waiting are rejected and the moderator is not asked again

#### Scenario: A place frees up
- **GIVEN** a full meeting and Zoe waiting
- **WHEN** a participant leaves the meeting
- **THEN** within a few seconds the moderator's panel shows one place left and lets them admit Zoe

#### Scenario: Two participants with the same name
- **GIVEN** two anonymous participants who both asked to join as "Ana"
- **WHEN** a moderator holding `lobbyAdmin` looks at the panel
- **THEN** each row shows "Ana" with the time that participant asked to join

#### Scenario: More waiting than free places
- **GIVEN** a meeting with two free places and three participants waiting
- **WHEN** a moderator holding `lobbyAdmin` presses "Admit 2"
- **THEN** the first two in line enter the meeting and the third keeps waiting

#### Scenario: Notice of a knock lost
- **GIVEN** a moderator holding `lobbyAdmin` in a meeting
- **WHEN** a participant starts waiting and the notice of that change never reaches the moderator's meeting
- **THEN** within about 30 seconds the moderator's participants panel lists them

### Requirement: The list follows lobbyAdmin at once
A participant who gains `lobbyAdmin` during the meeting SHALL see the waiting list at once, without waiting for it to change. One who loses it SHALL stop seeing the list, the chip and the notifications, and their host SHALL stop receiving `lobbyUpdated` and `participantKnocked`, at once.

#### Scenario: Promoted during the meeting
- **GIVEN** two participants waiting and a speaker without `lobbyAdmin` in the meeting
- **WHEN** a moderator gives the speaker a role that grants `lobbyAdmin`
- **THEN** the speaker's participants panel lists the two at once

#### Scenario: Demoted during the meeting
- **GIVEN** a moderator holding `lobbyAdmin` whose panel lists two participants waiting
- **WHEN** a manager gives them a role that denies `lobbyAdmin`
- **THEN** the section and the chip disappear at once and a new participant waiting raises no notification for them

### Requirement: Notification of a new participant waiting
While their participants panel is closed, a participant holding `lobbyAdmin` SHALL get a notification for each participant who starts waiting, with Deny and Admit, grouped into one with the number waiting and a View button when several wait. Joining a meeting while participants already wait SHALL show one grouped notification. The notification SHALL sit below the status rail on the top right, and opening the panel SHALL dismiss it.

#### Scenario: Panel closed
- **GIVEN** a moderator holding `lobbyAdmin` with the participants panel closed
- **WHEN** Zoe starts waiting
- **THEN** a notification names Zoe with Deny and Admit, and Admit lets her in

#### Scenario: Panel open
- **GIVEN** a moderator holding `lobbyAdmin` with the participants panel open
- **WHEN** Zoe starts waiting
- **THEN** no notification appears and Zoe is listed in the panel

#### Scenario: Joining with people waiting
- **GIVEN** three participants waiting
- **WHEN** a moderator holding `lobbyAdmin` joins the meeting
- **THEN** one notification says three people are waiting to join

### Requirement: The waiting list in the meeting comes only from the server
A meeting SHALL update the waiting list it shows only from what the server sends. A data message on the same topic from a participant SHALL be ignored, as for every server signal (see `meetings`).

#### Scenario: Forged waiting list
- **GIVEN** a speaker able to send data messages in a meeting
- **WHEN** they publish a message imitating the server's waiting list
- **THEN** no moderator's panel changes

### Requirement: Names in encrypted rooms
In an end-to-end encrypted room, the waiting list in the meeting SHALL show each name as the participants panel shows participants: decrypted when the waiting participant used the viewer's encryption key, masked otherwise, never encrypted. `lobbyList`, the webhooks and the embedded events SHALL carry the name as the participant's client sent it, as `participantJoined` does.

#### Scenario: Same key
- **GIVEN** an encrypted room where a moderator holding `lobbyAdmin` and Ana use the same encryption key
- **WHEN** Ana starts waiting
- **THEN** the moderator's panel and notification name her "Ana"

### Requirement: participantKnocked webhook
The server SHALL send the `participantKnocked` webhook once each time a participant asks to join and waits, without waiting for their waiting screen to connect, with `roomId`, `roomName` and the participant as `MeetLobbyParticipant`. It SHALL NOT be sent again when the same wait reconnects, nor by another replica. Like every webhook it is not stored: lost if the replica sending it stops, possibly repeated by the retries of `webhooks`, and unordered.

#### Scenario: Knock
- **GIVEN** a registered webhook subscribed to `participantKnocked` and scoped to the room
- **WHEN** a participant with `participant-external-id` "u-42" starts waiting
- **THEN** one `participantKnocked` webhook is delivered carrying their identity, name, `knockDate`, `type` and `externalId` "u-42"

#### Scenario: Knock on a replica, reconnection on another
- **GIVEN** two replicas and a participant who started waiting through replica A
- **WHEN** their realtime connection drops and reopens through replica B
- **THEN** no second `participantKnocked` webhook is delivered

#### Scenario: Knock never followed by a connection
- **GIVEN** a registered webhook subscribed to `participantKnocked` and `lobbyStatusChanged`
- **WHEN** a client asks to join and never opens its realtime connection
- **THEN** one `participantKnocked` webhook is delivered at once, and within about 20 seconds one `lobbyStatusChanged` webhook with `status` `expired`

### Requirement: lobbyStatusChanged webhook
The server SHALL send the `lobbyStatusChanged` webhook on each change of a wait after it started, with `roomId`, `roomName`, the participant (`MeetLobbyParticipant`), `waitedSeconds` since `knockDate`, `origin` as in `participantHandChanged`, and `status` of `MeetLobbyStatus`: `admitted`, `rejected`, `left`, `expired`, `meeting_ended`, `room_closed`, or `waiting` for an admitted participant back in line.

#### Scenario: Admitted by another moderator
- **GIVEN** a registered webhook subscribed to `lobbyStatusChanged` and a participant who has waited 90 seconds
- **WHEN** a moderator admits them
- **THEN** one `lobbyStatusChanged` webhook is delivered with `status` `admitted`, `origin` `moderator`, their identity and `waitedSeconds` 90

#### Scenario: Page closed for good
- **GIVEN** a registered webhook subscribed to `lobbyStatusChanged` and a participant waiting
- **WHEN** they close the browser tab and do not come back
- **THEN** about a minute later one `lobbyStatusChanged` webhook is delivered with `status` `expired` and `origin` `system`

#### Scenario: Waiter leaves
- **GIVEN** a registered webhook subscribed to `lobbyStatusChanged` and a participant waiting
- **WHEN** they press "Leave waiting room"
- **THEN** one `lobbyStatusChanged` webhook is delivered with `status` `left` and `origin` `participant`

### Requirement: participantKnocked embedded event
The embedded element of each participant holding `lobbyAdmin` in the meeting SHALL dispatch `participantKnocked` once for each participant who starts waiting while it is in the meeting, with `roomId` and the participant as `MeetLobbyParticipant`. Participants already waiting when the element joined SHALL be reported by `lobbyUpdated`, not by `participantKnocked`, and so SHALL a participant back in line after an admission that failed.

#### Scenario: Knock while in the meeting
- **GIVEN** a host listening to `participantKnocked` for a moderator holding `lobbyAdmin` in the meeting
- **WHEN** a participant starts waiting
- **THEN** the host receives one `participantKnocked` with that participant

#### Scenario: Speaker's host
- **GIVEN** an embedded speaker without `lobbyAdmin` in the meeting
- **WHEN** a participant starts waiting
- **THEN** the speaker's host receives no `participantKnocked`

#### Scenario: Back in line after a failed admission
- **GIVEN** a host listening to `participantKnocked` for a moderator holding `lobbyAdmin`, and Zoe admitted
- **WHEN** Zoe finds the meeting full and returns to the line
- **THEN** the host receives `lobbyUpdated` listing Zoe and no `participantKnocked`

### Requirement: lobbyUpdated embedded event
The embedded element of each participant holding `lobbyAdmin` in the meeting SHALL dispatch `lobbyUpdated` with `roomId` and the waiting list as `lobbyList` returns it: `participants` as `MeetLobbyParticipant` items in arrival order and `availablePlaces`. It SHALL be dispatched once after joining, or after gaining `lobbyAdmin`, and again each time it changes.

#### Scenario: Someone admitted by another moderator
- **GIVEN** two embedded moderators holding `lobbyAdmin` and Zoe and Ana waiting
- **WHEN** the first moderator admits Zoe
- **THEN** the second moderator's host receives `lobbyUpdated` with only Ana in `participants`

#### Scenario: Joining with people waiting
- **GIVEN** two participants waiting
- **WHEN** an embedded moderator holding `lobbyAdmin` joins the meeting
- **THEN** the host receives `lobbyUpdated` listing both and no `participantKnocked`

### Requirement: lobbyStatusChanged embedded event
The embedded element of a participant who waits SHALL dispatch `lobbyStatusChanged` with `roomId`, `participantIdentity` and `status` of `MeetLobbyStatus`: `waiting` with `queuePosition` (1 for the first) on the first state received, a position change or a return to the line, and each other value when the wait ends that way (`left` also for a wait replaced by a new request, `expired` whenever else their meeting says they lost their place). No `meetingLeft` SHALL be dispatched for a wait.

#### Scenario: Waiting then admitted
- **GIVEN** an embedded participant who asks to join and is second in line
- **WHEN** the participant ahead is admitted and then they are admitted
- **THEN** the host receives `lobbyStatusChanged` with `waiting` and position 2, `waiting` and position 1, then `admitted`, all with the identity the server answered when they asked, followed by `meetingJoined` with that identity

#### Scenario: Rejected
- **GIVEN** an embedded participant waiting
- **WHEN** a moderator rejects them
- **THEN** the host receives `lobbyStatusChanged` with `rejected` and no `meetingLeft`

#### Scenario: Realtime connection never opens
- **GIVEN** an embedded participant who asks to join and whose realtime connection never receives a message
- **WHEN** the meeting shows the connection error screen
- **THEN** the host receives no `lobbyStatusChanged`

#### Scenario: Admission lost on the way
- **GIVEN** an embedded participant admitted, whose host received `lobbyStatusChanged` with `admitted`
- **WHEN** the answer to their join token request is lost and their meeting says they lost their place
- **THEN** the host receives `lobbyStatusChanged` with `expired` and no `meetingJoined`

### Requirement: Waiting room commands
The embedded commands `lobbyAdmit` and `lobbyReject` SHALL admit or reject the waiting participants named by `participantIdentities`, one or several, or with `all` everyone waiting (`lobbyAdmit` up to the free places), through the REST operations of the same name and with their rules. Both SHALL be gated by `lobbyAdmin` and run only while the local participant is in the meeting.

#### Scenario: Admit from the host
- **GIVEN** an embedded moderator holding `lobbyAdmin` in the meeting and Zoe waiting
- **WHEN** the host calls `lobbyAdmit` with `participantIdentities` holding Zoe's identity
- **THEN** Zoe enters the meeting

#### Scenario: Admit a set chosen by the host
- **GIVEN** an embedded moderator holding `lobbyAdmin` in the meeting, and Zoe, Ana and Ben waiting
- **WHEN** the host calls `lobbyAdmit` with Zoe's and Ben's identities
- **THEN** Zoe and Ben enter the meeting and Ana keeps waiting

#### Scenario: Admit everyone from the host
- **GIVEN** an embedded moderator holding `lobbyAdmin` in a meeting with one free place, and Zoe and Ana waiting, in that order
- **WHEN** the host calls `lobbyAdmit` with `all` true
- **THEN** Zoe enters the meeting and Ana keeps waiting

#### Scenario: Deny everyone from the host
- **GIVEN** an embedded moderator holding `lobbyAdmin` in the meeting, and Zoe and Ana waiting
- **WHEN** the host calls `lobbyReject` with `all` true
- **THEN** Zoe and Ana are told they weren't let in

#### Scenario: Without the permission
- **GIVEN** an embedded speaker without `lobbyAdmin` and Zoe waiting
- **WHEN** the host calls `lobbyReject` with Zoe's identity
- **THEN** the command is rejected and Zoe keeps waiting

### Requirement: The host of a waiting participant
While the local participant waits, `mediaToggleAudio` and `mediaToggleVideo` SHALL act on the camera preview and microphone as on the device setup screen, and `meetingLeave` SHALL leave the waiting room, dispatching `lobbyStatusChanged` with `left`.

#### Scenario: Leave command while waiting
- **GIVEN** an embedded participant waiting
- **WHEN** the host calls `meetingLeave()`
- **THEN** the participant leaves the waiting room, `lobbyList` no longer lists them, and the host receives `lobbyStatusChanged` with `left`

#### Scenario: Leave command and removal at once
- **GIVEN** an embedded participant waiting
- **WHEN** the host calls `meetingLeave()` and removes the element right after
- **THEN** `lobbyList` no longer lists them and a `lobbyStatusChanged` webhook with `left` is sent

#### Scenario: Camera off while waiting
- **GIVEN** an embedded participant waiting with the camera on
- **WHEN** the host calls `mediaToggleVideo(false)`
- **THEN** the preview turns off, and the participant joins with the camera off once admitted

### Requirement: Waiting room in the room wizard
The Room Access step of the console room wizard SHALL hold a Waiting room section with a switch for `lobby.enabled` and a field for `lobby.message`. The field SHALL be shown only while the switch is on. Each role SHALL get a "Join without waiting" switch for `lobbyBypass` and an "Admit participants" switch for `lobbyAdmin`, in a "Waiting room" permission group.

#### Scenario: Creating a room with a waiting room
- **GIVEN** the wizard
- **WHEN** the user turns the waiting room on, writes a message and finishes
- **THEN** the new room has `lobby.enabled` true and that `lobby.message`
