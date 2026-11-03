## MODIFIED Requirements

### Requirement: Command catalogue
Meet SHALL accept exactly the commands `meetingLeave`, `meetingEnd`, `participantKick`, `participantMute`, `participantMuteAll`, `participantUpdateRole`, `participantHandRaise`, `participantHandLower`, `participantHandLowerAll`, `participantReactionSend`, `mediaToggleAudio`, `mediaToggleVideo`, `mediaToggleScreenShare`, `recordingStart`, `recordingStop`, `broadcastStart` and `broadcastStop`, and the deprecated `endMeeting`, `leaveRoom` and `kickParticipant`, each as its owner specifies.

#### Scenario: Owner of each command
- **WHEN** a reviewer looks up what a command does
- **THEN** `meetingLeave` is specified in `meeting-join`
- **AND** `meetingEnd` in `meetings`
- **AND** `participantKick`, `participantMute`, `participantMuteAll` and `participantUpdateRole` in `meeting-moderation`
- **AND** `participantHandRaise`, `participantHandLower` and `participantHandLowerAll` in `raise-hand`
- **AND** `participantReactionSend` in `reactions`
- **AND** `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare` in `meeting-media`
- **AND** `recordingStart` and `recordingStop` in `recordings`
- **AND** `broadcastStart` and `broadcastStop` in `live-broadcast`
- **AND** `endMeeting`, `leaveRoom` and `kickParticipant` in this capability, as aliases

### Requirement: Event catalogue
Meet SHALL emit exactly the events `meetingJoined`, `meetingLeft`, `participantJoined`, `participantLeft`, `participantRoleChanged`, `participantHandChanged`, `participantReactionSent`, `mediaAudioStatusChanged`, `mediaVideoStatusChanged`, `mediaScreenShareStatusChanged`, `recordingStatusChanged`, `broadcastStarted`, `broadcastUpdated`, `broadcastEnded` and `embeddedCloseRequested`, plus the deprecated `joined`, `left` and `closed`, each emitted as its owning capability specifies.

#### Scenario: Owner of each event
- **WHEN** a reviewer looks up when an event is emitted and what its payload means
- **THEN** `meetingJoined`, `meetingLeft` and `embeddedCloseRequested` are specified in `meeting-join`
- **AND** `participantJoined` and `participantLeft` in `meetings`
- **AND** `participantRoleChanged` in `meeting-moderation`
- **AND** `participantHandChanged` in `raise-hand`
- **AND** `participantReactionSent` in `reactions`
- **AND** `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and `mediaScreenShareStatusChanged` in `meeting-media`
- **AND** `recordingStatusChanged` in `recordings`
- **AND** `broadcastStarted`, `broadcastUpdated` and `broadcastEnded` in `live-broadcast`
- **AND** `joined`, `left` and `closed` in this capability, as aliases
