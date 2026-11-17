# Spec Delta

## MODIFIED Requirements

### Requirement: Event catalogue

Meet SHALL emit exactly the events `meetingJoined`, `meetingLeft`, `participantJoined`, `participantLeft`, `waitingParticipantKnocked`, `participantRoleChanged`, `participantHandChanged`, `participantReactionSent`, `mediaAudioStatusChanged`, `mediaVideoStatusChanged`, `mediaScreenShareStatusChanged`, `recordingStarted`, `recordingUpdated`, `recordingEnded`, `broadcastStarted`, `broadcastUpdated`, `broadcastEnded`, `waitingParticipantListUpdated`, `waitingParticipantStatusChanged` and `embeddedCloseRequested`, plus the deprecated `joined`, `left` and `closed`.

#### Scenario: Owner of each event

- **WHEN** a reviewer looks up when an event is emitted and what its payload means
- **THEN** `meetingJoined`, `meetingLeft` and `embeddedCloseRequested` are specified in `meeting-join`
- **AND** `participantJoined` and `participantLeft` in `meetings`
- **AND** `participantRoleChanged` in `meeting-moderation`
- **AND** `participantHandChanged` in `raise-hand`
- **AND** `participantReactionSent` in `reactions`
- **AND** `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and `mediaScreenShareStatusChanged` in `meeting-media`
- **AND** `recordingStarted`, `recordingUpdated` and `recordingEnded` in `recordings`
- **AND** `broadcastStarted`, `broadcastUpdated` and `broadcastEnded` in `live-broadcast`
- **AND** `waitingParticipantKnocked`, `waitingParticipantListUpdated` and `waitingParticipantStatusChanged` in `locked-room`
- **AND** `joined`, `left` and `closed` in this capability, as aliases
