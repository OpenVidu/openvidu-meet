# Meetings Specification

## Purpose

A meeting is the live session held in a room, from the first participant pressing Join until it ends. Participants, host applications, REST clients and webhook receivers rely on when it starts and ends, its limits and how its participants are reported.

Surfaces: REST API (`meetingGet`, `meetingEnd`, `participantList`, `participantGet`; `meet-ce/backend/openapi/meetings/`), webhooks (`meetingStarted`, `meetingEnded`, `participantJoined`, `participantLeft`; `meet-ce/backend/openapi/webhooks/`), embedded command `meetingEnd` and events `participantJoined`, `participantLeft` (`meet-ce/typings/src/embedded/`), room config `maxParticipants` and `maxDurationMinutes`, the meeting UI (end meeting option, ending-soon notice, meeting-full screen). Documented in openvidu.io `docs/meet/features/meetings/overview.md`, `lifecycle.md`, `configuration.md`, `moderation.md` and `docs/meet/embedded/reference/webhooks.md`.

## Requirements

### Requirement: A meeting starts when a participant commits to join
A room SHALL hold at most one meeting at a time. Meet SHALL start the meeting when a participant of a room without a running meeting obtains a join token, which the meeting UI does when the participant presses the join button of the device setup screen (see `meeting-join`). Opening the access link or staying on the join or device setup screen SHALL NOT start it. While the meeting runs, the room status SHALL be `active_meeting` (see `rooms`).

#### Scenario: Choosing devices does not start the meeting
- **GIVEN** an open room with no meeting running
- **WHEN** a participant opens its access link and stays on the device setup screen
- **THEN** the room status stays `open`
- **AND** no `meetingStarted` webhook is sent

#### Scenario: Pressing Join starts the meeting
- **GIVEN** an open room with no meeting running
- **WHEN** a participant presses the join button of the device setup screen
- **THEN** the room status becomes `active_meeting`

#### Scenario: Later participants join the running meeting
- **GIVEN** a room whose meeting is running
- **WHEN** another participant presses Join
- **THEN** they enter the same meeting and no new meeting starts

### Requirement: meetingStarted webhook
The server SHALL send the `meetingStarted` webhook exactly once per meeting, when it starts, carrying the room including its `config` and `roles` (delivery rules in `webhooks`). A start reported for a room that is no longer `open` SHALL be ignored.

#### Scenario: Webhook on start
- **GIVEN** a registered webhook subscribed to `meetingStarted`
- **WHEN** the first participant presses Join in a room without a meeting
- **THEN** one `meetingStarted` webhook is delivered whose payload is that room with its `config` and `roles`

#### Scenario: Two replicas handle the same start
- **GIVEN** two Meet replicas sharing MongoDB and Redis
- **WHEN** replica A handles the start of a meeting and replica B's periodic consistency check examines the same room at the same time
- **THEN** exactly one `meetingStarted` webhook is sent for that meeting

### Requirement: A closed room never runs a meeting
When the media server opens a meeting in a room whose status is `closed` (for example a still-valid token reconnecting directly), the server SHALL end that meeting at once, keep the room `closed` and send no `meetingStarted` webhook.

#### Scenario: Stale token reconnects to a closed room
- **GIVEN** a room that was closed after its last meeting
- **WHEN** a participant holding a still-valid join token reconnects to the media server directly
- **THEN** the server ends that meeting immediately
- **AND** the room stays `closed` and no `meetingStarted` webhook is sent

### Requirement: A meeting nobody connects to ends on its own
A meeting that starts but receives no participant connection within 20 seconds SHALL end on its own, as any other end does.

#### Scenario: The participant who pressed Join never connects
- **GIVEN** a participant pressed Join in a room without a meeting, starting it
- **WHEN** no participant connects to the meeting within 20 seconds
- **THEN** the meeting ends and a `meetingEnded` webhook is sent
- **AND** the room status returns to `open`

### Requirement: A meeting outlives its last participant for 20 seconds
After the last participant leaves, the meeting SHALL keep running for 20 seconds before it ends. A participant joining within that window SHALL enter the same meeting. Until the meeting ends the room status SHALL stay `active_meeting`, so room changes refused during a meeting (see `room-config` and `room-access`) stay refused in that window.

#### Scenario: Last participant leaves
- **GIVEN** a meeting with one participant
- **WHEN** that participant leaves
- **THEN** the meeting ends about 20 seconds later and `meetingEnded` is sent

#### Scenario: Rejoining within the window
- **GIVEN** the last participant left a meeting 5 seconds ago
- **WHEN** a participant presses Join in that room
- **THEN** they enter the same meeting
- **AND** no new `meetingStarted` webhook is sent

#### Scenario: Room configuration within the window
- **GIVEN** the last participant left a meeting 5 seconds ago
- **WHEN** a client updates the room's configuration
- **THEN** the request is rejected with 409 because the room still has an active meeting

### Requirement: End a meeting through the REST API
`DELETE /api/v1/meetings/{roomId}` (`meetingEnd`) SHALL end the room's meeting for every participant, who leave with reason `meeting_ended`, and stop the recordings in progress (see `recordings`). It SHALL accept an API key or a room member token for that room holding `meetingEnd`, answer 404 when the room does not exist and 200 without any action when the room has no meeting running.

#### Scenario: Moderator ends the meeting
- **GIVEN** a running meeting with three participants
- **WHEN** a client holding `meetingEnd` calls `meetingEnd` for the room
- **THEN** the request answers 200
- **AND** every participant is disconnected with reason `meeting_ended` and the meeting ends

#### Scenario: No meeting running
- **GIVEN** an existing room with no meeting running
- **WHEN** a client calls `meetingEnd` for it
- **THEN** the request answers 200 and nothing changes

#### Scenario: Room does not exist
- **WHEN** a client calls `meetingEnd` for a room id that does not exist
- **THEN** the request answers 404

#### Scenario: Missing permission or credentials
- **GIVEN** a room member token for the room without `meetingEnd`
- **WHEN** it calls `meetingEnd`
- **THEN** the request answers 403
- **AND** the same request without any credential answers 401

### Requirement: End the meeting from the meeting and the embedded API
A participant holding `meetingEnd` SHALL find an End meeting option next to Leave in the toolbar's leave menu, which ends the meeting for everyone. Participants without `meetingEnd` SHALL only be able to leave. The embedded command `meetingEnd`, and its deprecated alias `endMeeting` until 3.12.0, SHALL end the meeting on behalf of the local participant, gated by `meetingEnd` (execution rules in `embedded-api`).

#### Scenario: Option offered to a holder of meetingEnd
- **GIVEN** a participant holding `meetingEnd` in a meeting
- **WHEN** they open the leave menu and choose End meeting
- **THEN** the meeting ends for every participant

#### Scenario: Option not offered without meetingEnd
- **GIVEN** a participant without `meetingEnd`
- **WHEN** they look at the toolbar
- **THEN** no End meeting option is offered

#### Scenario: Host ends the meeting with a command
- **GIVEN** an embedded participant holding `meetingEnd` who has joined the meeting
- **WHEN** the host calls `meetingEnd()`, or the deprecated `endMeeting()`
- **THEN** every participant leaves the meeting and a `meetingEnded` webhook is sent

#### Scenario: Command without the permission
- **GIVEN** an embedded participant without `meetingEnd`
- **WHEN** the host calls `meetingEnd()`
- **THEN** the command is rejected and the meeting keeps running

### Requirement: meetingEnded webhook
The server SHALL send the `meetingEnded` webhook exactly once per meeting, when it ends, whatever ended it (`meetingEnd`, the last participant leaving, the duration limit, a forced room deletion), carrying the room including its `config` and `roles`. Its `reason` SHALL be `max_duration_reached` only when the duration limit ended the meeting and SHALL be absent otherwise.

#### Scenario: Normal end
- **GIVEN** a registered webhook subscribed to `meetingEnded`
- **WHEN** a moderator ends the meeting
- **THEN** one `meetingEnded` webhook is delivered with the room and without `reason`

#### Scenario: The end is reported to two replicas
- **GIVEN** two Meet replicas sharing MongoDB and Redis
- **WHEN** the media server's notice that the meeting finished reaches both replicas at the same time
- **THEN** exactly one `meetingEnded` webhook is sent for that meeting

### Requirement: Meeting state is reconciled with the media server
Meet SHALL check, at least every 15 minutes and once per cluster, that the rooms' meeting status matches the media server: a room marked `active_meeting` whose meeting no longer exists SHALL be handled as ended (sending `meetingEnded`), and a room marked `open` whose meeting is running SHALL be handled as started (sending `meetingStarted`).

#### Scenario: Missed end
- **GIVEN** a room marked `active_meeting` whose meeting no longer exists in the media server
- **WHEN** the periodic check runs
- **THEN** the room returns to `open` and `meetingEnded` is sent

#### Scenario: Check runs once in a cluster
- **GIVEN** two Meet replicas sharing MongoDB and Redis
- **WHEN** the time for the periodic check comes
- **THEN** only one replica runs it, and each inconsistent room is handled once

### Requirement: Meeting deadline from the duration limit
When the room's `maxDurationMinutes` is set (bounds in `room-config`), the meeting SHALL get a deadline when it starts, its start plus that many minutes, which `meetingGet` reports as `endDate`. The deadline SHALL NOT change during the meeting. A meeting in a room without a limit SHALL have no `endDate`.

#### Scenario: Deadline reported
- **GIVEN** a room with `maxDurationMinutes` 30 whose meeting started at T
- **WHEN** a client calls `meetingGet`
- **THEN** `endDate` minus `startDate` equals 30 minutes

#### Scenario: No limit
- **GIVEN** a room without `maxDurationMinutes`
- **WHEN** a client calls `meetingGet` during its meeting
- **THEN** the response carries no `endDate`

### Requirement: The meeting ends at its deadline
The server SHALL end a meeting that reaches its deadline exactly as `meetingEnd` does, and the `meetingEnded` webhook SHALL carry `reason: max_duration_reached`. Participants' own `meetingLeft` reason SHALL be `meeting_ended_by_duration_limit` (see `meeting-join`). The end SHALL happen at most one minute after the deadline even when the replica that started the meeting stops.

#### Scenario: Deadline reached
- **GIVEN** a meeting whose deadline is reached
- **WHEN** the deadline passes
- **THEN** every participant is disconnected
- **AND** `meetingEnded` is sent with `reason: max_duration_reached`

#### Scenario: The replica that started the meeting stops
- **GIVEN** two Meet replicas and a meeting with a duration limit started through replica A
- **WHEN** replica A stops before the deadline
- **THEN** replica B ends the meeting no later than one minute after the deadline

#### Scenario: Two replicas reach the deadline together
- **GIVEN** two Meet replicas that both find the same meeting past its deadline
- **WHEN** both try to end it at the same time
- **THEN** the meeting is ended once and exactly one `meetingEnded` webhook is sent

### Requirement: Participants are warned before the deadline
During the last five minutes before the deadline, the meeting SHALL show every participant a notice with the minutes left, play a sound and count down to the end (in the status rail, see `meeting-layout`). A participant joining inside that window SHALL get the notice at once. The countdown SHALL follow the server's deadline even when the device clock is wrong.

#### Scenario: Five minutes left
- **GIVEN** a participant in a meeting whose deadline is 6 minutes away
- **WHEN** one minute passes
- **THEN** they see "This meeting will end in about 5 minutes" and hear a sound
- **AND** a countdown to the deadline is shown until the meeting ends

#### Scenario: Joining in the last minutes
- **GIVEN** a meeting whose deadline is 3 minutes away
- **WHEN** a participant joins it
- **THEN** they see the ending-soon notice at once

### Requirement: Participant limit on joining
When the room's `maxParticipants` is set (bounds in `room-config`), a request for a token that joins the meeting while the meeting already holds that many participants SHALL be rejected with 409, and the meeting UI SHALL tell the participant the meeting is full. Recorders and agents SHALL not count. Tokens that do not join a meeting SHALL be unaffected. If the participants cannot be counted, the request SHALL fail with 500 rather than be granted.

#### Scenario: Meeting full
- **GIVEN** a room with `maxParticipants` 2 whose meeting holds 2 participants
- **WHEN** a third participant presses Join
- **THEN** the token request is rejected with 409
- **AND** the participant sees that the meeting has reached its maximum number of participants

#### Scenario: Token that does not join
- **GIVEN** a full meeting
- **WHEN** a client requests a room member token that does not join the meeting
- **THEN** the token is granted

#### Scenario: Counting fails
- **GIVEN** a room with `maxParticipants` set and the media server failing to list participants
- **WHEN** a participant asks to join
- **THEN** the request fails with 500

### Requirement: Participant limit at connection
The cap SHALL be taken from the room's `maxParticipants` when the meeting starts, reported by `meetingGet` as `maxParticipants`, and enforced by the media server too: a join token obtained while there was room but used after the meeting filled SHALL be refused at connection, and the participant told the meeting is full.

#### Scenario: Token redeemed too late
- **GIVEN** a room with `maxParticipants` 1 and two join tokens obtained while the meeting was empty
- **WHEN** the first participant connects and then the second tries to connect
- **THEN** the second connection is refused and that participant sees the meeting is full

#### Scenario: Cap reported
- **GIVEN** a meeting in a room with `maxParticipants` 5
- **WHEN** a client calls `meetingGet`
- **THEN** the response carries `maxParticipants` 5

### Requirement: Read a live meeting
`GET /api/v1/meetings/{roomId}` (`meetingGet`) SHALL return the live state of the room's meeting (start, deadline, participant count, whether a recording is in progress, participant cap; see the OpenAPI) and SHALL answer 404 when the room does not exist or has no meeting running. It SHALL accept an API key or a room member token for that room holding `meetingRead`; holding `meetingJoin` alone SHALL NOT be enough.

#### Scenario: Meeting running
- **GIVEN** a running meeting with one participant
- **WHEN** a client holding `meetingRead` calls `meetingGet`
- **THEN** the request answers 200 with `participantCount` 1

#### Scenario: No meeting
- **GIVEN** an existing room without a meeting
- **WHEN** a client holding `meetingRead` calls `meetingGet`
- **THEN** the request answers 404 stating the room has no active meeting

#### Scenario: Token without meetingRead
- **GIVEN** a room member token for the room that holds `meetingJoin` but not `meetingRead`
- **WHEN** it calls `meetingGet`
- **THEN** the request answers 403

#### Scenario: Token for another room
- **GIVEN** a room member token minted for room B
- **WHEN** it calls `meetingGet` for room A
- **THEN** the request answers 403

### Requirement: List and read the participants of a meeting
`participantList` (`GET /api/v1/meetings/{roomId}/participants`) SHALL list the participants currently in the meeting and `participantGet` SHALL return one of them, as live snapshots (identity, name, `externalId`, `metadata`, role, join date, media and hand state; see the OpenAPI). Both SHALL require `meetingRead`. `participantList` SHALL answer 404 without a meeting and `participantGet` 404 for anyone not in it. Recorders and agents SHALL never be listed, counted or returned.

#### Scenario: List participants
- **GIVEN** a meeting with two participants and a recording in progress
- **WHEN** a client holding `meetingRead` calls `participantList`
- **THEN** exactly the two participants are listed, each with its current media state

#### Scenario: Participant not in the meeting
- **WHEN** a client calls `participantGet` for an identity that is not in the meeting
- **THEN** the request answers 404

### Requirement: Participants that did not join through Meet
A participant connected to the meeting without going through Meet's join SHALL be reported in snapshots, webhooks and events with role `speaker` and without `externalId` or `metadata`.

#### Scenario: Participant without Meet data
- **GIVEN** a participant connected to the meeting directly to the media server
- **WHEN** a client calls `participantGet` for it
- **THEN** its role is `speaker` and it carries no `externalId`

### Requirement: Participant identity
Every participant SHALL get a `participantIdentity` unique within the meeting: the member id for room members, the user id for registered users without a member record, and, for anonymous access, a value derived from the participant name plus a random suffix that differs on every join.

#### Scenario: Member keeps their identity
- **GIVEN** a room member who joined, left and joins again
- **WHEN** a client lists the participants
- **THEN** the member's `participantIdentity` is their member id both times

#### Scenario: Anonymous participant gets a new identity per join
- **GIVEN** an anonymous participant named "Ana" who joined, left and joins again
- **WHEN** a client lists the participants
- **THEN** the identity starts with `ana-` and differs from the one of the first join

### Requirement: Joining again replaces the earlier session
When a participant joins with an identity already present in the meeting (the same member or user from another tab or device), the earlier session SHALL be disconnected with reason `duplicate_identity`.

#### Scenario: Same member in a second tab
- **GIVEN** a room member in the meeting
- **WHEN** the same member joins from a second browser tab
- **THEN** the first tab leaves the meeting with reason `duplicate_identity`

### Requirement: Unique participant names
Within a meeting, display names SHALL be unique ignoring case. A requested name already in use SHALL be given the smallest free numeric suffix (`Ana_1`, then `Ana_2`); a requested name ending in `_<number>` SHALL be suffixed from its base, never stacked (`Ana_1` taken gives `Ana_2`, not `Ana_1_1`). The assigned name SHALL be the one shown and reported everywhere.

#### Scenario: Duplicate name
- **GIVEN** a meeting where "Ana" is present
- **WHEN** another participant joins as "ana"
- **THEN** they are named "ana_1"

#### Scenario: Name with a numeric suffix
- **GIVEN** a meeting where "Ana" and "Ana_1" are present
- **WHEN** another participant joins as "Ana_1"
- **THEN** they are named "Ana_2"

### Requirement: Participant names are released
A participant's name SHALL be freed when they leave the meeting, and every name of the room when the meeting ends; a freed numeric suffix SHALL be the first one reused. Names SHALL stay unique when joins with the same name reach different replicas at the same time.

#### Scenario: Freed suffix reused
- **GIVEN** "Ana", "Ana_1" and "Ana_2" in a meeting
- **WHEN** "Ana_1" leaves and another "Ana" joins
- **THEN** the new participant is named "Ana_1"

#### Scenario: Simultaneous joins on two replicas
- **GIVEN** two Meet replicas sharing Redis and a meeting without any "Ana"
- **WHEN** two participants ask to join as "Ana" at the same time, each through a different replica
- **THEN** one is named "Ana" and the other "Ana_1"

### Requirement: participantJoined webhook
The server SHALL send the `participantJoined` webhook when a participant connects to the meeting, carrying the participant's identity, name, `externalId`, `metadata`, role and `joinDate` (payload shape in `webhooks`). Recorders and agents SHALL NOT be reported. Each connection SHALL be reported once even when the media server's notification reaches several replicas.

#### Scenario: Participant joins
- **GIVEN** a registered webhook subscribed to `participantJoined`
- **WHEN** a participant joined with `participant-external-id` "u-42" connects
- **THEN** one `participantJoined` webhook is delivered carrying their identity, name, role, `joinDate` and `externalId` "u-42"

#### Scenario: Recorder is not reported
- **WHEN** a recording starts in the meeting
- **THEN** no `participantJoined` webhook is sent for the recorder

#### Scenario: The join is reported to two replicas
- **GIVEN** two Meet replicas sharing MongoDB and Redis
- **WHEN** the media server's notice of one participant's connection reaches both replicas at the same time
- **THEN** exactly one `participantJoined` webhook is sent for that connection

### Requirement: participantLeft webhook
The server SHALL send the `participantLeft` webhook when a participant leaves the meeting, carrying the fields of `participantJoined` plus `leaveDate` (when the server observed the departure), `durationSeconds` (0 when the join date is unknown) and `leaveReason`.

#### Scenario: Participant leaves
- **GIVEN** a participant who stayed 2 minutes in a meeting
- **WHEN** they leave
- **THEN** one `participantLeft` webhook is delivered with `durationSeconds` about 120 and `leaveReason` `voluntary_leave`

### Requirement: Leave reasons
The `leaveReason` of `participantLeft`, in the webhook and the embedded event, SHALL be `voluntary_leave` (left on their own), `network_disconnect` (connection lost), `server_shutdown`, `participant_kicked`, `meeting_ended` (the meeting ended for everyone, whatever ended it), `duplicate_identity`, or `unknown` when none of these applies. `meeting_ended_by_self` and `meeting_ended_by_duration_limit` SHALL only appear in the local participant's `meetingLeft` (see `meeting-join`).

#### Scenario: Kicked participant
- **WHEN** a moderator kicks a participant
- **THEN** their `participantLeft` webhook carries `leaveReason` `participant_kicked`

#### Scenario: Meeting ended by the duration limit
- **WHEN** a meeting reaches its deadline
- **THEN** each `participantLeft` webhook carries `leaveReason` `meeting_ended`

#### Scenario: Lost connection
- **WHEN** a participant's browser crashes and the media server drops them
- **THEN** their `participantLeft` webhook carries `leaveReason` `network_disconnect`

### Requirement: Embedded participantJoined and participantLeft events
The embedded element SHALL dispatch `participantJoined` and `participantLeft` for remote participants only, as they join and leave, without replaying those already present when the local participant joins; the local participant's own arrival and departure are `meetingJoined` and `meetingLeft` (see `meeting-join`). Each `participant` SHALL match its webhook's, `joinDate` and `leaveReason` included, without `leaveDate` nor `durationSeconds`.

#### Scenario: Remote participant joins and leaves
- **GIVEN** an embedded participant in a meeting
- **WHEN** another participant joins and later leaves voluntarily
- **THEN** the host receives `participantJoined` with the same `joinDate` as the webhook
- **AND** then `participantLeft` with `participant.leaveReason` `voluntary_leave` and no `leaveDate`

#### Scenario: No replay of present participants
- **GIVEN** a meeting with two participants
- **WHEN** an embedded participant joins it
- **THEN** the host receives `meetingJoined` and no `participantJoined` for the two already present
