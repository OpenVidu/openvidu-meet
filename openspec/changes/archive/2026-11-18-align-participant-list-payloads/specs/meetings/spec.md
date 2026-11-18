# Spec Delta

## ADDED Requirements

### Requirement: A participant tells how they joined

Every participant who joined through Meet, as reported by `participantList`, `participantGet`, a webhook or an embedded event, SHALL carry a `type` the server derives from the credential they joined with, with the values of the waiting list (`locked-room`): `user` for their own Meet account, `identified_guest` for their personal member link, `anonymous` for a shared link of the room. A promotion or demotion SHALL NOT change it.

#### Scenario: Shared link

- **GIVEN** a participant who joined with the room's anonymous speaker link and the `participant-external-id` "u-42"
- **WHEN** a client holding `meetingRead` calls `participantGet` for them
- **THEN** they have `type` `anonymous` and `externalId` "u-42"

#### Scenario: Account and personal link

- **GIVEN** a user in the meeting with their own account and an identified guest with their personal link
- **WHEN** a client holding `meetingRead` calls `participantList`
- **THEN** the user has `type` `user` and the identified guest `identified_guest`

#### Scenario: The webhook and the embedded event agree

- **GIVEN** an embedded participant in a meeting and a registered webhook subscribed to `participantJoined`
- **WHEN** another participant joins with the room's anonymous speaker link
- **THEN** the `participantJoined` webhook and the host's `participantJoined` event both carry `type` `anonymous`

#### Scenario: Promotion keeps the type

- **GIVEN** a participant who joined with the anonymous speaker link
- **WHEN** a moderator promotes them
- **THEN** the `participantRoleChanged` webhook carries role `moderator` and `type` `anonymous`

## MODIFIED Requirements

### Requirement: List and read the participants of a meeting

`participantList` (`GET /api/v1/meetings/{roomId}/participants`) SHALL list the participants currently in the meeting, in no promised order, and `participantGet` SHALL return one of them, as live snapshots (identity, name, `type`, `externalId`, `metadata`, role, join date, media and hand state; see the OpenAPI). Both SHALL require `meetingRead`. `participantList` SHALL answer 404 without a meeting and `participantGet` 404 for anyone not in it. Recorders and agents SHALL never be listed, counted or returned.

#### Scenario: List participants

- **GIVEN** a meeting with two participants and a recording in progress
- **WHEN** a client holding `meetingRead` calls `participantList`
- **THEN** exactly the two participants are listed, each with its `type` and its current media state

#### Scenario: Participant not in the meeting

- **WHEN** a client calls `participantGet` for an identity that is not in the meeting
- **THEN** the request answers 404

### Requirement: Participants that did not join through Meet

A participant connected to the meeting without going through Meet's join SHALL be reported in snapshots, webhooks and events with role `speaker` and without `type`, `externalId` or `metadata`.

#### Scenario: Participant without Meet data

- **GIVEN** a participant connected to the meeting directly to the media server
- **WHEN** a client calls `participantGet` for it
- **THEN** its role is `speaker` and it carries no `type` nor `externalId`

### Requirement: participantJoined webhook

The server SHALL send the `participantJoined` webhook when a participant connects to the meeting, carrying the participant's identity, name, `type`, `externalId`, `metadata`, role and `joinDate` (payload shape in `webhooks`). Recorders and agents SHALL NOT be reported. Each connection SHALL be reported once even when the media server's notification reaches several replicas.

#### Scenario: Participant joins

- **GIVEN** a registered webhook subscribed to `participantJoined`
- **WHEN** a participant joined with the anonymous speaker link and `participant-external-id` "u-42" connects
- **THEN** one `participantJoined` webhook is delivered carrying their identity, name, role, `joinDate`, `type` `anonymous` and `externalId` "u-42"

#### Scenario: Recorder is not reported

- **WHEN** a recording starts in the meeting
- **THEN** no `participantJoined` webhook is sent for the recorder

#### Scenario: The join is reported to two replicas

- **GIVEN** two Meet replicas sharing MongoDB and Redis
- **WHEN** the media server's notice of one participant's connection reaches both replicas at the same time
- **THEN** exactly one `participantJoined` webhook is sent for that connection
