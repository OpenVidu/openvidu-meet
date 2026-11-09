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
In a room with `lobby.enabled`, a participant who asks to join SHALL wait instead of joining, unless they hold `lobbyBypass` or were admitted to the meeting running in the room. An admin and the room's owner hold every permission and SHALL join directly. The server checks of `meeting-join` SHALL run before a participant waits, except the participant limit, which applies when they are admitted.

#### Scenario: Speaker waits
- **GIVEN** a room with the waiting room on whose speaker role denies `lobbyBypass`
- **WHEN** a participant with the anonymous speaker link presses "Ask to join"
- **THEN** they see the waiting screen and do not enter the meeting

#### Scenario: Moderator joins directly
- **GIVEN** a room with the waiting room on whose moderator role grants `lobbyBypass`
- **WHEN** a participant with the anonymous moderator link presses join
- **THEN** they enter the meeting

#### Scenario: Admitted member joins again
- **GIVEN** a member without `lobbyBypass` who was admitted to the running meeting
- **WHEN** they reload the page and join again
- **THEN** they enter the meeting without waiting

#### Scenario: Closed room
- **GIVEN** a closed room with the waiting room on
- **WHEN** a speaker asks to join
- **THEN** the server answers `409` and the "Closed room" error screen is shown, as without the waiting room

### Requirement: Asking to join neither starts nor enters the meeting
Asking to join a room where the participant waits SHALL answer with a waiting credential, which SHALL NOT let its holder connect to the meeting's media. It SHALL NOT start the meeting, reserve the participant's name or take a place in the meeting. It SHALL fix the participant identity they keep once admitted (identity rules in `meetings`).

#### Scenario: Room stays open
- **GIVEN** an open room with the waiting room on and no meeting running
- **WHEN** a speaker asks to join and waits
- **THEN** the room status stays `open` and no `meetingStarted` webhook is sent

#### Scenario: Waiting credential against the media server
- **GIVEN** a waiting credential
- **WHEN** a client tries to connect to the meeting's media with it
- **THEN** the connection is refused

#### Scenario: Waiting while the meeting is full
- **GIVEN** a room with the waiting room on and `maxParticipants` 2, whose meeting holds 2 participants
- **WHEN** a third participant asks to join
- **THEN** they wait

### Requirement: A place in line lasts while the participant stays in touch
A participant SHALL start waiting when they ask to join, and keep their place while their meeting client stays in touch with Meet, whichever replica it reaches: through its realtime connection (see `deployment`) or, when that connection cannot open, by asking for its state at intervals. Leaving the waiting screen or closing the page SHALL end the wait at once.

#### Scenario: Leaving the waiting room
- **GIVEN** a participant waiting
- **WHEN** they press "Leave waiting room"
- **THEN** `lobbyList` no longer lists them

#### Scenario: Page closed
- **GIVEN** a participant waiting
- **WHEN** they close the browser tab
- **THEN** `lobbyList` no longer lists them

#### Scenario: Replica stops
- **GIVEN** two replicas and a participant waiting whose realtime connection is held by replica A
- **WHEN** replica A stops and the client reconnects through replica B
- **THEN** the participant keeps their place in line

#### Scenario: Network that blocks realtime connections
- **GIVEN** a participant whose network refuses WebSocket connections to Meet
- **WHEN** they ask to join and a moderator admits them
- **THEN** `lobbyList` listed them while they waited, and they enter the meeting within seconds of the admission

### Requirement: Away participants keep their place for five minutes
A participant out of touch for 30 seconds SHALL be listed as away and keep their place. One out of touch for 5 minutes SHALL lose it, and their wait SHALL end.

#### Scenario: Short network loss
- **GIVEN** a participant second in line
- **WHEN** their connection drops and comes back 20 seconds later
- **THEN** they are still second in line and no new `participantKnocked` webhook is sent

#### Scenario: Phone in the background
- **GIVEN** a participant second in line on a phone
- **WHEN** they switch to another app for two minutes and come back
- **THEN** `lobbyList` lists them as away while they are gone
- **AND** when they come back they are still second in line and no longer away

#### Scenario: Gone for good
- **GIVEN** a participant waiting whose device lost its network for good
- **WHEN** five minutes pass
- **THEN** `lobbyList` stops listing them

### Requirement: One wait per participant identity
When a participant asks to join while the same identity already waits, from another tab, another device or after reloading, the new request SHALL take over that wait and its place, without a new `participantKnocked` webhook, and the earlier screen SHALL say that the wait continues elsewhere.

#### Scenario: Member asks from a second device
- **GIVEN** a member waiting second in line on a laptop
- **WHEN** they ask to join the same room from a phone
- **THEN** the phone shows them second in line
- **AND** the laptop says the wait continues on another device
- **AND** `lobbyList` lists them once

### Requirement: Waiting list
`GET /api/v1/meetings/{roomId}/lobby` (`lobbyList`) SHALL return the participants waiting in the room as `MeetLobbyParticipant` (`meet-ce/backend/openapi/meetings/`), in order of arrival (`knockDate`, ties broken by identity), with whether each one is away, whether or not a meeting runs. It SHALL require `lobbyAdmin` (`403`). Participants already admitted SHALL NOT be listed.

#### Scenario: Two participants waiting
- **GIVEN** Ana asked to join before Ben
- **WHEN** a client holding `lobbyAdmin` calls `lobbyList`
- **THEN** it returns Ana and then Ben, each with their identity, name and `knockDate`

#### Scenario: Waiting before the meeting starts
- **GIVEN** a room with no meeting running and a participant waiting
- **WHEN** a backend calls `lobbyList` with the API key
- **THEN** it returns that participant

#### Scenario: Without the permission
- **GIVEN** a room member token without `lobbyAdmin`
- **WHEN** its holder calls `lobbyList`
- **THEN** the server answers `403`

### Requirement: Limits on asking to join
A room SHALL hold at most 100 participants waiting: one more asking to join SHALL be refused with `409` and see that the waiting room is full. A rejected participant SHALL NOT start a new wait until 15 seconds after the rejection; the server SHALL answer `429` before that.

#### Scenario: Waiting room full
- **GIVEN** a room with 100 participants waiting
- **WHEN** another participant asks to join
- **THEN** the server answers `409` and they see that the waiting room is full

#### Scenario: Asking again at once
- **GIVEN** a participant rejected five seconds ago
- **WHEN** their client asks to join again
- **THEN** the server answers `429` and they are not listed

### Requirement: Admit or reject one participant
`PUT /api/v1/meetings/{roomId}/lobby/{participantIdentity}` (`lobbyResolve`) with `action` `admit` or `reject` SHALL admit or reject that waiting participant. It SHALL require `lobbyAdmin` (`403`), answer `404` when the identity is not waiting, `409` when admitting them would exceed the meeting's participant limit (see "Admissions take places in the meeting"), and `422` for any other `action`.

#### Scenario: Admitting
- **GIVEN** a participant waiting
- **WHEN** a moderator holding `lobbyAdmin` calls `lobbyResolve` with `admit` for them
- **THEN** the server answers `200` and the participant enters the meeting

#### Scenario: Identity not waiting
- **WHEN** a client holding `lobbyAdmin` calls `lobbyResolve` for an identity that is not waiting
- **THEN** the server answers `404`

#### Scenario: Unknown action
- **WHEN** a client calls `lobbyResolve` with `action` `block`
- **THEN** the server answers `422`

### Requirement: Admit or reject several participants
`PUT /api/v1/meetings/{roomId}/lobby` (`lobbyResolveAll`) with `action` `admit` or `reject` and the `participantIdentities` it applies to SHALL admit or reject those of them still waiting, skip the others, and answer with the participants it resolved. An admission SHALL apply to all of them or to none: when they do not all fit in the meeting, the server SHALL answer `409` and admit nobody. It SHALL require `lobbyAdmin` (`403`).

#### Scenario: Admitting the three shown
- **GIVEN** three participants waiting, shown to a moderator as "Admit 3"
- **WHEN** a fourth participant starts waiting and the moderator presses "Admit 3"
- **THEN** the three shown enter the meeting and the fourth keeps waiting

#### Scenario: Not enough places
- **GIVEN** a meeting with two free places and three participants waiting
- **WHEN** a client calls `lobbyResolveAll` with `admit` and the three identities
- **THEN** the server answers `409` and the three keep waiting

### Requirement: One decision per participant across replicas
Decisions on the same waiting participant SHALL apply one at a time across every replica: the first one SHALL apply and a later one SHALL answer `404`, since the participant no longer waits.

#### Scenario: Admit and reject at once on two replicas
- **GIVEN** two replicas sharing Redis and a participant waiting
- **WHEN** one moderator admits them through replica A while another rejects them through replica B
- **THEN** one request answers `200`, the other `404`, and the participant is either admitted or rejected, not both

### Requirement: Admissions take places in the meeting
A meeting's `maxParticipants` SHALL count the participants connected to it plus those admitted who have not joined yet, whichever replica admitted them. An admission that would exceed it SHALL be refused, and so SHALL a participant joining without waiting (see `meeting-join`), so the holder of `lobbyAdmin` chooses who takes the free places. The meeting SHALL show the admitters how many places are free and SHALL NOT offer an admission that does not fit.

#### Scenario: Last free place
- **GIVEN** a meeting with `maxParticipants` 3, two participants connected and Ana and Ben waiting
- **WHEN** a moderator admits Ana and, before she connects, tries to admit Ben
- **THEN** Ana enters the meeting and the admission of Ben is refused with `409`

#### Scenario: Place held for an admitted participant
- **GIVEN** a meeting with one free place, just given to an admitted participant who has not connected yet
- **WHEN** a participant holding `lobbyBypass` presses join
- **THEN** the server answers `409` and the "Meeting full" error screen is shown

#### Scenario: Admitting on two replicas
- **GIVEN** two replicas, a meeting with one free place and two participants waiting
- **WHEN** two moderators admit one each at the same time, through different replicas
- **THEN** one admission succeeds and the other is refused with `409`

### Requirement: Admitted participants join with the identity they waited with
An admitted participant's meeting SHALL join without reloading the page, keeping the devices chosen, with the identity they waited with. The server SHALL issue their join token only after admission, applying at that moment the checks of `meeting-join`. Asking again with the waiting credential before admission SHALL keep the participant waiting with the same identity and place.

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
- **WHEN** their client asks to join again with the waiting credential
- **THEN** they are still waiting, second in line, with the same identity

### Requirement: A failed admission returns to the line
When an admitted participant cannot join, because the meeting turned out to be full, the network or the media server failed, or they did not join within 60 seconds of the admission, they SHALL go back to waiting in their earlier place, and the waiting list SHALL show them again. When the room was closed or their access withdrawn in the meantime, their wait SHALL end with the screen of that case.

#### Scenario: Tab closed after the admission
- **GIVEN** a participant first in line who closes their laptop just as they are admitted
- **WHEN** 60 seconds pass without them joining
- **THEN** `lobbyList` lists them again, first in line and away

#### Scenario: Room closed before joining
- **GIVEN** a participant admitted to an open room with no meeting running
- **WHEN** the room is closed before their meeting connects
- **THEN** their wait ends and the "Closed room" error screen is shown

### Requirement: Only admitted participants stay in the meeting
In a room with the waiting room on, a participant who connects to the meeting's media without having been admitted to the meeting running in the room, and without holding `lobbyBypass`, SHALL be removed at once, whatever credential they connected with. A participant removed by a moderator SHALL have to ask again to come back. What a meeting records about who was admitted SHALL end with the meeting.

#### Scenario: Kicked participant reusing their credentials
- **GIVEN** a speaker who was admitted and then removed by a moderator
- **WHEN** they connect to the meeting's media again with the credentials they held
- **THEN** they are removed at once

#### Scenario: Earlier credentials in the next meeting
- **GIVEN** a speaker admitted to a meeting that has ended
- **WHEN** they connect to the room's next meeting with the credentials of the earlier one
- **THEN** they are removed at once

### Requirement: Only admitted participants read the meeting
In a room with the waiting room on, `meetingGet` and `participantList`, `participantGet` (see `meetings`) and `broadcastList` and `broadcastGet` (see `live-broadcast`) SHALL answer `403` to a room member token unless its holder holds `lobbyBypass` or was admitted to the meeting running in the room. API keys SHALL keep their access.

#### Scenario: Waiting participant lists the participants
- **GIVEN** a participant waiting with a speaker link whose role grants `meetingRead`
- **WHEN** their client calls `participantList` for the room
- **THEN** the server answers `403`

#### Scenario: Admitted participant reads the meeting
- **GIVEN** a speaker admitted to the running meeting
- **WHEN** their client calls `meetingGet`
- **THEN** the server answers `200`

#### Scenario: Link holder who never asked
- **GIVEN** a room member token obtained with the speaker link without asking to join
- **WHEN** its holder calls `meetingGet` while a meeting runs
- **THEN** the server answers `403`

### Requirement: Rejected participants may ask again
A rejected participant SHALL leave the waiting list and be told they were not let in, and MAY ask to join again once the pause of "Limits on asking to join" has passed, which starts a new wait at the end of the line.

#### Scenario: Asking again after a rejection
- **GIVEN** a participant who was rejected 20 seconds ago while Ben waits
- **WHEN** they press "Ask to join again"
- **THEN** they wait behind Ben

### Requirement: What ends a wait without a decision
A wait SHALL end, telling the participant why, when the meeting running in the room is ended on purpose (from the meeting, the embedded API or the REST API, or by its duration limit), when the room is closed or deleted, from the moment it actually closes, and when the participant leaves. A participant who asks to join after a meeting ended SHALL wait for the next one.

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
A meeting that ends because its last participants left or lost their connection SHALL NOT end any wait, and the participants admitted to it who had not joined SHALL return to the line.

#### Scenario: Host loses the connection
- **GIVEN** a moderator alone in a meeting and a participant waiting
- **WHEN** the moderator's laptop sleeps for one minute and the meeting ends because it was left empty
- **THEN** the participant keeps waiting in their place
- **AND** when the moderator comes back and joins, their participants panel lists the participant

### Requirement: Turning the waiting room off lets everyone in
Turning `lobby.enabled` off between meetings SHALL let everyone waiting in, each through the usual join checks of `meeting-join`.

#### Scenario: Waiting room turned off between meetings
- **GIVEN** a room with no meeting running and two participants waiting
- **WHEN** its owner calls `updateRoomConfig` with `lobby.enabled` false
- **THEN** both participants are let in and enter the meeting

### Requirement: The waiting screen
The device setup button SHALL read "Ask to join" when pressing it would make the participant wait. While waiting, the meeting SHALL show the participant's position in line, the room's `lobby.message`, the camera preview with the device controls, and a "Leave waiting room" button. When no participant holding `lobbyAdmin` is in the meeting, it SHALL say that the host has not joined yet. All of it SHALL update live, the message included when it changes between meetings.

#### Scenario: Position moves up
- **GIVEN** Ana and Ben waiting, in that order
- **WHEN** Ana is admitted
- **THEN** Ben's waiting screen says he is first in line

#### Scenario: Host joins
- **GIVEN** a participant waiting while no participant holding `lobbyAdmin` is in the meeting
- **WHEN** a moderator holding `lobbyAdmin` joins
- **THEN** the waiting screen stops saying that the host has not joined yet

#### Scenario: Message changed between meetings
- **GIVEN** a participant waiting in a room with no meeting running
- **WHEN** its owner changes `lobby.message`
- **THEN** the waiting screen shows the new message

### Requirement: Time waited
While a participant waits, the waiting screen SHALL show how long they have been waiting, in whole minutes from the first minute on, counted from their `knockDate`, which a replacement of the wait and a return to the line keep. Screen readers SHALL NOT announce it as it changes.

#### Scenario: Reload while waiting
- **GIVEN** a participant who has waited 4 minutes
- **WHEN** they reload the page and their new wait replaces the old one
- **THEN** the waiting screen says they have been waiting 4 minutes

### Requirement: Waiting in a background tab
While a participant waits, the page title SHALL show their position in line, and say that they are in once admitted. A participant admitted while the page is not visible SHALL join with the microphone off.

#### Scenario: Admitted in a background tab
- **GIVEN** a participant waiting with the microphone on, whose waiting page is in a background tab
- **WHEN** a moderator admits them
- **THEN** they join with the microphone off and the tab title says they are in

### Requirement: A waiting participant learns nothing of the others
A waiting participant SHALL never receive from the waiting room the names, identities, externalIds or metadata of the other participants waiting or of the participants in the meeting; reading the meeting is ruled by "Only admitted participants read the meeting".

#### Scenario: Two participants waiting
- **GIVEN** Ana and Ben waiting
- **WHEN** Ben's meeting receives his waiting state
- **THEN** it holds his position and nothing that identifies Ana

### Requirement: Screens after a wait without admission
After a wait ends without admission, the meeting SHALL say why:
- rejected: "You weren't let in", with a button to ask again;
- left: that they left the waiting room;
- replaced: that the wait continues on another tab or device;
- the meeting ended: that it has ended;
- the room was closed or deleted: that case's error screen;
- full: that the waiting room is full, with a button to ask again.

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
In the meeting, only participants holding `lobbyAdmin` SHALL see the waiting list, live and in arrival order: a "Waiting to join" section at the top of the participants panel, each row with Deny and Admit and marking who is away, and a status rail chip with the number waiting. The section SHALL show the free places when the meeting has a participant limit and, from two waiting, Deny all, after a confirmation, and "Admit N", disabled when they do not all fit.

#### Scenario: Section and chip
- **GIVEN** a moderator holding `lobbyAdmin` in a meeting and a speaker without it
- **WHEN** a participant starts waiting
- **THEN** the moderator's participants panel lists them and the status rail shows "1 waiting to join"
- **AND** the speaker sees neither

#### Scenario: Deny everyone
- **GIVEN** three participants waiting
- **WHEN** a moderator presses Deny all and confirms
- **THEN** the three are rejected

### Requirement: A new admitter sees the list at once
A participant who gains `lobbyAdmin` during the meeting SHALL see the waiting list at once, without waiting for it to change.

#### Scenario: Promoted during the meeting
- **GIVEN** two participants waiting and a speaker without `lobbyAdmin` in the meeting
- **WHEN** a moderator gives the speaker a role that grants `lobbyAdmin`
- **THEN** the speaker's participants panel lists the two at once

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
The server SHALL send the `participantKnocked` webhook once each time a participant starts waiting, with `roomId`, `roomName` and the participant as `MeetLobbyParticipant` (`meet-ce/backend/openapi/webhooks/`). It SHALL NOT be sent again when the same wait reconnects, asks again or moves to another tab or device, and SHALL be sent once across replicas.

#### Scenario: Knock
- **GIVEN** a registered webhook subscribed to `participantKnocked` and scoped to the room
- **WHEN** a participant with `participant-external-id` "u-42" starts waiting
- **THEN** one `participantKnocked` webhook is delivered carrying their identity, name, `knockDate` and `externalId` "u-42"

#### Scenario: Knock on a replica, reconnection on another
- **GIVEN** two replicas and a participant who started waiting through replica A
- **WHEN** their realtime connection drops and reopens through replica B
- **THEN** no second `participantKnocked` webhook is delivered

### Requirement: lobbyStatusChanged webhook
The server SHALL send the `lobbyStatusChanged` webhook each time a wait changes after it started, with `roomId`, `roomName`, the participant as `MeetLobbyParticipant` and `status`: `admitted`, `rejected`, `left` (left the waiting room or closed the page), `expired` (out of touch for 5 minutes), `ended` (with `reason` `meeting_ended` or `room_closed`), or `waiting` (back in line after an admission). A wait taken over by the same identity SHALL send none.

#### Scenario: Admitted by another moderator
- **GIVEN** a registered webhook subscribed to `lobbyStatusChanged` and a participant waiting
- **WHEN** a moderator admits them
- **THEN** one `lobbyStatusChanged` webhook is delivered with `status` `admitted` and their identity

#### Scenario: Waiter leaves
- **GIVEN** a registered webhook subscribed to `lobbyStatusChanged` and a participant waiting
- **WHEN** they press "Leave waiting room"
- **THEN** one `lobbyStatusChanged` webhook is delivered with `status` `left`

### Requirement: participantKnocked embedded event
The embedded element of each participant holding `lobbyAdmin` in the meeting SHALL dispatch `participantKnocked` once for each participant who starts waiting while it is in the meeting, with `roomId` and the participant as `MeetLobbyParticipant`. Participants already waiting when the element joined SHALL be reported by `lobbyUpdated`, not by `participantKnocked`.

#### Scenario: Knock while in the meeting
- **GIVEN** a host listening to `participantKnocked` for a moderator holding `lobbyAdmin` in the meeting
- **WHEN** a participant starts waiting
- **THEN** the host receives one `participantKnocked` with that participant

#### Scenario: Speaker's host
- **GIVEN** an embedded speaker without `lobbyAdmin` in the meeting
- **WHEN** a participant starts waiting
- **THEN** the speaker's host receives no `participantKnocked`

### Requirement: lobbyUpdated embedded event
The embedded element of each participant holding `lobbyAdmin` in the meeting SHALL dispatch `lobbyUpdated` with `roomId` and the whole waiting list as `MeetLobbyParticipant` items, in arrival order: once after joining, or after gaining `lobbyAdmin`, and again each time the list changes.

#### Scenario: Someone admitted by another moderator
- **GIVEN** two embedded moderators holding `lobbyAdmin` and Zoe and Ana waiting
- **WHEN** the first moderator admits Zoe
- **THEN** the second moderator's host receives `lobbyUpdated` listing only Ana

#### Scenario: Joining with people waiting
- **GIVEN** two participants waiting
- **WHEN** an embedded moderator holding `lobbyAdmin` joins the meeting
- **THEN** the host receives `lobbyUpdated` listing both and no `participantKnocked`

### Requirement: lobbyStatusChanged embedded event
The embedded element of a participant who waits SHALL dispatch `lobbyStatusChanged` with `roomId` and `status`: `waiting` with `queuePosition` when the wait starts, the position changes or a failed admission puts them back in line; `admitted`; `rejected`; `left`; or `ended`, with `reason` `meeting_ended`, `room_closed` or `replaced`. No `meetingLeft` SHALL be dispatched for a wait, since the participant never joined.

#### Scenario: Waiting then admitted
- **GIVEN** an embedded participant who asks to join and is second in line
- **WHEN** the participant ahead is admitted and then they are admitted
- **THEN** the host receives `lobbyStatusChanged` with `waiting` and position 2, `waiting` and position 1, then `admitted`, followed by `meetingJoined`

#### Scenario: Rejected
- **GIVEN** an embedded participant waiting
- **WHEN** a moderator rejects them
- **THEN** the host receives `lobbyStatusChanged` with `rejected` and no `meetingLeft`

### Requirement: Waiting room commands
The embedded commands `lobbyAdmit(participantIdentity)` and `lobbyReject(participantIdentity)` SHALL admit or reject one waiting participant, and `lobbyAdmitAll()` and `lobbyRejectAll()` the participants of the waiting list the element holds, as the panel does. All four SHALL be gated by `lobbyAdmin` and run only while the local participant is in the meeting.

#### Scenario: Admit from the host
- **GIVEN** an embedded moderator holding `lobbyAdmin` in the meeting and Zoe waiting
- **WHEN** the host calls `lobbyAdmit` with Zoe's identity
- **THEN** Zoe enters the meeting

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
