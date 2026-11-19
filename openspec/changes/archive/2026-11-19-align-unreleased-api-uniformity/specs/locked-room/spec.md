## MODIFIED Requirements

### Requirement: A room is locked per room access

The room access field `access.lock.enabled` SHALL decide whether a room makes the participants who ask to join wait, `false` by default. The optional `access.lock.message`, up to 500 characters, SHALL be shown to the participants while they wait. Like the rest of the access settings, `access.lock` SHALL NOT change while a meeting runs (see `room-access`), and the meeting SHALL offer no way to unlock the room.

#### Scenario: Room created unlocked

- **WHEN** a client creates a room without `access.lock`
- **THEN** `roomGet` returns `access.lock.enabled` false and every participant joins directly

#### Scenario: Message too long

- **WHEN** a client calls `roomUpdateAccess` with an `access.lock.message` of 501 characters
- **THEN** the server answers `422` and the access settings are unchanged

#### Scenario: Unlocking during a meeting

- **GIVEN** a locked room and a meeting running
- **WHEN** its owner calls `roomUpdateAccess` with `access.lock.enabled` false
- **THEN** the server answers `409` and the room stays locked

### Requirement: Rejecting waiting participants in bulk

`DELETE /api/v1/meetings/{roomId}/waiting-participants?participantIdentities=a,b` (`waitingParticipantBulkReject`) SHALL require `waitingParticipantAdmin` (`403`) and reject each participant named on their own. It SHALL answer `200` when all were rejected and `400` when any was not, with `deleted` and `failed` listing each side. It SHALL answer `422` for no identity or more than 100 distinct ones.

#### Scenario: Rejecting everyone named

- **GIVEN** Ana, Ben and Zoe waiting
- **WHEN** a client holding `waitingParticipantAdmin` calls `waitingParticipantBulkReject` naming Ana and Ben
- **THEN** the server answers `200` with Ana and Ben in `deleted` and `failed` empty, both are told they weren't let in, and Zoe keeps waiting

#### Scenario: Naming someone who no longer waits

- **GIVEN** Ana waiting and Ben admitted
- **WHEN** a client calls `waitingParticipantBulkReject` naming Ana and Ben
- **THEN** the server answers `400` with Ana in `deleted` and Ben in `failed`, and Ana is rejected

#### Scenario: Too many or no identities

- **WHEN** a client calls `waitingParticipantBulkReject` naming nobody, or 101 distinct identities
- **THEN** the server answers `422` and nobody is rejected

### Requirement: Unlocking the room lets everyone in

Turning `access.lock.enabled` off between meetings SHALL let everyone waiting in, each through the usual join checks of `meeting-join`. When they outnumber the free places, the first to connect SHALL stay, whenever they asked, and the others SHALL see "Meeting full".

#### Scenario: Room unlocked between meetings

- **GIVEN** a room with no meeting running and two participants waiting
- **WHEN** its owner calls `roomUpdateAccess` with `access.lock.enabled` false
- **THEN** both participants are let in and enter the meeting

#### Scenario: Reconnecting when it is turned off

- **GIVEN** a participant waiting whose connection is down for twenty seconds
- **WHEN** its owner unlocks the room meanwhile and the connection comes back
- **THEN** the participant enters the meeting

#### Scenario: More participants waiting than places

- **GIVEN** a room with `maxParticipants` 2, no meeting running, and Ana, Ben and Zoe waiting in that order
- **WHEN** its owner unlocks the room
- **THEN** two of them enter the meeting and the third sees "Meeting full"

### Requirement: Commands on waiting participants

`waitingParticipantAdmit`, `waitingParticipantReject` (given a `participantIdentity`) and `waitingParticipantAdmitAll` SHALL run the REST operation of the same name. `waitingParticipantRejectAll` SHALL call `waitingParticipantBulkReject` with everyone the meeting shows waiting, nothing when nobody, and SHALL not fail for those who stopped waiting. All four SHALL require `waitingParticipantAdmin` and the local participant in the meeting.

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
