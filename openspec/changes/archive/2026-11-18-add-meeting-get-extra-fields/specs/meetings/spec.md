# Spec Delta

## ADDED Requirements

### Requirement: Extra fields of a live meeting

`meetingGet` SHALL leave out the extra fields `participants` and `waitingParticipants` unless requested through `extraFields` or the `X-ExtraFields` header, whose values SHALL combine and whose unknown names SHALL be ignored. With `participants` requested it SHALL carry the participants `participantList` returns. Every response SHALL list the extra fields in `_extraFields`. `waitingParticipants` is specified in `locked-room`.

#### Scenario: Default response

- **GIVEN** a running meeting with one participant
- **WHEN** a client holding `meetingRead` calls `meetingGet` without `extraFields`
- **THEN** the request answers 200 with `participantCount` 1 and neither `participants` nor `waitingParticipants`
- **AND** `_extraFields` lists `participants` and `waitingParticipants`

#### Scenario: Participants requested

- **GIVEN** a meeting with two participants and a recording in progress
- **WHEN** a client holding `meetingRead` calls `meetingGet` with `extraFields=participants`
- **THEN** `participants` holds exactly the two participants, each as `participantList` returns it
- **AND** the response carries no `waitingParticipants`

#### Scenario: Header and query combine

- **GIVEN** a running meeting
- **WHEN** a backend calls `meetingGet` with the API key, `extraFields=participants` and the header `X-ExtraFields: waitingParticipants`
- **THEN** the response carries both `participants` and `waitingParticipants`

#### Scenario: Unknown names

- **GIVEN** a running meeting
- **WHEN** a client holding `meetingRead` calls `meetingGet` with `extraFields=foo`
- **THEN** the request answers 200 with neither `participants` nor `waitingParticipants`

#### Scenario: No meeting

- **GIVEN** an existing room without a meeting
- **WHEN** a client holding `meetingRead` calls `meetingGet` with `extraFields=participants`
- **THEN** the request answers 404 stating the room has no active meeting
