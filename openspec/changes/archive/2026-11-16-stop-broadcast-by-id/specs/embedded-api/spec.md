## MODIFIED Requirements

### Requirement: Command catalogue

Meet SHALL accept exactly the commands `meetingLeave`, `meetingEnd`, `participantKick`, `participantMute`, `participantMuteAll`, `participantUpdateRole`, `participantHandRaise`, `participantHandLower`, `participantHandLowerAll`, `participantReactionSend`, `mediaToggleAudio`, `mediaToggleVideo`, `mediaToggleScreenShare`, `recordingStart`, `recordingStop`, `broadcastStart`, `broadcastStop`, `broadcastStopAll`, `waitingParticipantAdmit`, `waitingParticipantAdmitAll`, `waitingParticipantReject` and `waitingParticipantRejectAll`, and the deprecated `endMeeting`, `leaveRoom` and `kickParticipant`.

#### Scenario: Owner of each command

- **WHEN** a reviewer looks up what a command does
- **THEN** `meetingLeave` is specified in `meeting-join`
- **AND** `meetingEnd` in `meetings`
- **AND** `participantKick`, `participantMute`, `participantMuteAll` and `participantUpdateRole` in `meeting-moderation`
- **AND** `participantHandRaise`, `participantHandLower` and `participantHandLowerAll` in `raise-hand`
- **AND** `participantReactionSend` in `reactions`
- **AND** `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare` in `meeting-media`
- **AND** `recordingStart` and `recordingStop` in `recordings`
- **AND** `broadcastStart`, `broadcastStop` and `broadcastStopAll` in `live-broadcast`
- **AND** `waitingParticipantAdmit`, `waitingParticipantAdmitAll`, `waitingParticipantReject` and `waitingParticipantRejectAll` in `locked-room`
- **AND** `endMeeting`, `leaveRoom` and `kickParticipant` in this capability, as aliases
