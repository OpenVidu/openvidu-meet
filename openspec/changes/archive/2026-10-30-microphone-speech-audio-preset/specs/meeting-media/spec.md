# Spec Delta

## ADDED Requirements

### Requirement: Microphone audio quality
The microphone SHALL be published at speech quality, with the audio encoder capped at 24 kbps, and SHALL keep silence suppression and, outside end-to-end encrypted rooms, redundant audio against packet loss. The audio of a shared screen SHALL NOT be capped at that speech bitrate.

#### Scenario: Speaking
- **GIVEN** a participant publishing their microphone in a room without end-to-end encryption
- **WHEN** they speak
- **THEN** their microphone audio is encoded at 24 kbps at most
- **AND** each audio packet also carries the previous audio frame

#### Scenario: Packet loss
- **GIVEN** a participant who receives another participant's microphone with 3% of the packets lost
- **WHEN** the other participant speaks
- **THEN** the lost audio is recovered from the redundant frames, without audible gaps

#### Scenario: Sharing a tab with sound
- **GIVEN** a participant sharing a browser tab with its audio
- **WHEN** the tab plays music
- **THEN** the tab audio is published without the 24 kbps speech cap
