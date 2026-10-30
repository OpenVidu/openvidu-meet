# Spec Delta

## ADDED Requirements

### Requirement: Shared screen audio
The audio of a shared screen SHALL be captured without echo cancellation, noise suppression or automatic gain control, so the others hear it as the shared surface plays it. When the shared audio is the system audio, Meet SHALL ask the browser to leave out the audio the meeting itself plays, so the participants do not hear their own voices back.

#### Scenario: Sharing a tab that plays music
- **GIVEN** a participant sharing a browser tab with its audio
- **WHEN** the tab plays music
- **THEN** the tab audio is published without echo cancellation, noise suppression or automatic gain control

#### Scenario: Sharing a silent tab
- **GIVEN** a participant sharing a browser tab with its audio
- **WHEN** the tab plays nothing for a minute
- **THEN** the screen-share audio sends almost no data during that minute

#### Scenario: Sharing the entire screen with system audio
- **GIVEN** a participant on Windows sharing their entire screen with the system audio
- **WHEN** another participant speaks
- **THEN** that participant does not hear their own voice coming back through the shared screen
