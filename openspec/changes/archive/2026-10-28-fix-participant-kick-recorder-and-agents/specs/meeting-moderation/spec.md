## MODIFIED Requirements

### Requirement: Kick a participant
`DELETE /api/v1/meetings/{roomId}/participants/{participantIdentity}` (`participantKick`) SHALL disconnect that participant from the meeting, whatever their role, and they SHALL leave with reason `participant_kicked` (their own `meetingLeft`, and the `participantLeft` webhook and event). It SHALL answer 404 when the participant is not in the meeting, and SHALL answer 404 and disconnect nothing for a recorder or an agent, which are never participants of the meeting.

#### Scenario: Participant kicked
- **GIVEN** a speaker in a running meeting
- **WHEN** a client holding `participantKick` kicks them
- **THEN** the request answers 200 and the speaker leaves the meeting
- **AND** the `participantLeft` webhook carries `leaveReason` `participant_kicked`

#### Scenario: Participant not in the meeting
- **WHEN** a client kicks an identity that is not in the meeting
- **THEN** the request answers 404

#### Scenario: Recorder of a recording in progress
- **GIVEN** a meeting being recorded
- **WHEN** a client holding `participantKick` calls `participantKick` with the identity of the recorder
- **THEN** the request answers 404
- **AND** the recording goes on

#### Scenario: Live captions assistant
- **GIVEN** a meeting whose live captions assistant is running
- **WHEN** a client holding `participantKick` calls `participantKick` with the identity of the assistant
- **THEN** the request answers 404
- **AND** the captions keep arriving
