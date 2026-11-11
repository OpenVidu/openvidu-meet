## MODIFIED Requirements

### Requirement: Command catalogue
Meet SHALL accept exactly the commands `meetingLeave`, `meetingEnd`, `participantKick`, `participantMute`, `participantMuteAll`, `participantUpdateRole`, `participantHandRaise`, `participantHandLower`, `participantHandLowerAll`, `participantReactionSend`, `mediaToggleAudio`, `mediaToggleVideo`, `mediaToggleScreenShare`, `recordingStart`, `recordingStop`, `broadcastStart`, `broadcastStop`, `waitingRoomAdmit` and `waitingRoomReject`, and the deprecated `endMeeting`, `leaveRoom` and `kickParticipant`.

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
- **AND** `waitingRoomAdmit` and `waitingRoomReject` in `waiting-room`
- **AND** `endMeeting`, `leaveRoom` and `kickParticipant` in this capability, as aliases

### Requirement: Commands run only when the meeting phase allows them
Meet SHALL run `mediaToggleAudio` and `mediaToggleVideo` from the device setup screen (the prejoin screen of the reference, see `meeting-join`) onwards, the waiting screen included, `meetingLeave` also while the local participant waits to be admitted (see `waiting-room`), and every other command only while the local participant is in the meeting, connected or reconnecting. A command received at any other moment SHALL be rejected with a console warning and SHALL NOT be kept for later.

#### Scenario: Media toggle on the device setup screen
- **GIVEN** the participant is on the device setup screen
- **WHEN** the host calls `mediaToggleVideo(false)`
- **THEN** the camera is turned off on the device setup screen

#### Scenario: Media toggle while waiting
- **GIVEN** the participant waits to be admitted
- **WHEN** the host calls `mediaToggleAudio(false)`
- **THEN** the microphone is turned off on the waiting screen

#### Scenario: Meeting command before joining
- **GIVEN** a moderator on the device setup screen
- **WHEN** the host calls `participantKick` for a participant in the meeting
- **THEN** nobody is kicked, and the command does not run once the moderator joins

#### Scenario: Meeting command while waiting
- **GIVEN** a participant holding `waitingRoomAdmin` who waits to be admitted
- **WHEN** the host calls `waitingRoomAdmit` with the identity of another participant waiting
- **THEN** nobody is admitted and the console warns that the command was rejected

#### Scenario: Command after leaving
- **GIVEN** the participant left and sees the end screen
- **WHEN** the host calls `meetingLeave` or `mediaToggleAudio`
- **THEN** nothing happens and the console warns that the command was rejected

#### Scenario: Command while reconnecting
- **GIVEN** a moderator whose connection to the meeting is being restored
- **WHEN** the host calls `meetingEnd`
- **THEN** Meet runs the command instead of rejecting it

### Requirement: Event catalogue
Meet SHALL emit exactly the events `meetingJoined`, `meetingLeft`, `participantJoined`, `participantLeft`, `participantKnocked`, `participantRoleChanged`, `participantHandChanged`, `participantReactionSent`, `mediaAudioStatusChanged`, `mediaVideoStatusChanged`, `mediaScreenShareStatusChanged`, `recordingStatusChanged`, `broadcastStarted`, `broadcastUpdated`, `broadcastEnded`, `waitingRoomUpdated`, `waitingRoomStatusChanged` and `embeddedCloseRequested`, plus the deprecated `joined`, `left` and `closed`.

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
- **AND** `participantKnocked`, `waitingRoomUpdated` and `waitingRoomStatusChanged` in `waiting-room`
- **AND** `joined`, `left` and `closed` in this capability, as aliases
