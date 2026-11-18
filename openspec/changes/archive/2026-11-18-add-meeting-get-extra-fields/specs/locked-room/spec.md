# Spec Delta

## ADDED Requirements

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
