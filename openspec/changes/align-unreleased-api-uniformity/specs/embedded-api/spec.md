## MODIFIED Requirements

### Requirement: Command catalogue
Meet SHALL accept exactly the commands `meetingLeave`, `meetingEnd`, `participantKick`, `participantMute`, `participantMuteAll`, `participantUpdateRole`, `participantRaiseHand`, `participantLowerHand`, `participantLowerAllHands`, `participantSendReaction`, `mediaToggleAudio`, `mediaToggleVideo`, `mediaToggleScreenShare`, `recordingStart`, `recordingStop`, `broadcastStart`, `broadcastStop`, `broadcastStopAll`, `waitingParticipantAdmit`, `waitingParticipantAdmitAll`, `waitingParticipantReject` and `waitingParticipantRejectAll`, and the deprecated `endMeeting`, `leaveRoom` and `kickParticipant`.

#### Scenario: Owner of each command
- **WHEN** a reviewer looks up what a command does
- **THEN** `meetingLeave` is specified in `meeting-join`
- **AND** `meetingEnd` in `meetings`
- **AND** `participantKick`, `participantMute`, `participantMuteAll` and `participantUpdateRole` in `meeting-moderation`
- **AND** `participantRaiseHand`, `participantLowerHand` and `participantLowerAllHands` in `raise-hand`
- **AND** `participantSendReaction` in `reactions`
- **AND** `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare` in `meeting-media`
- **AND** `recordingStart` and `recordingStop` in `recordings`
- **AND** `broadcastStart`, `broadcastStop` and `broadcastStopAll` in `live-broadcast`
- **AND** `waitingParticipantAdmit`, `waitingParticipantAdmitAll`, `waitingParticipantReject` and `waitingParticipantRejectAll` in `locked-room`
- **AND** `endMeeting`, `leaveRoom` and `kickParticipant` in this capability, as aliases

### Requirement: Commands run with the local participant's permissions
Meet SHALL run a command that declares a permission (its `@permission` in the typings) only when the local participant holds that permission when the command arrives, except `participantLowerHand` for the own hand (see `raise-hand`); otherwise it SHALL reject the command, without effect, with a console warning naming it and the missing permission. The check SHALL be identical on every transport, and the server still enforces every permission (see `permissions`).

#### Scenario: Missing permission on the webcomponent
- **GIVEN** a speaker without `participantMute`
- **WHEN** their host calls `participantMute` for another participant
- **THEN** nobody is muted and the console warns that `participantMute` is missing

#### Scenario: Missing permission in an iframe
- **GIVEN** a speaker without `participantKick`
- **WHEN** their host posts `{ command: "participantKick", payload: { participantIdentity: "p-1" } }`
- **THEN** participant `p-1` stays in the meeting

#### Scenario: Permission gained during the meeting
- **GIVEN** a speaker promoted to moderator whose host has received `participantRoleChanged`
- **WHEN** the host calls `meetingEnd`
- **THEN** the meeting ends
