## ADDED Requirements

### Requirement: A name is released only by the session that holds it
When a session leaves, its participant name SHALL be freed only if that session is the one that reserved it, whatever the difference between the clocks of the Meet replicas and the media nodes.

#### Scenario: Media node behind Meet
- **GIVEN** a media node whose clock is one second behind the Meet replica that issued the token
- **WHEN** the participant "Ana" leaves
- **THEN** the name "Ana" is freed and the next participant asking for it is named "Ana"

#### Scenario: Media node ahead of Meet
- **GIVEN** a media node whose clock is one second ahead and a member "Ana" who rejoined
- **WHEN** the departure of their earlier session is processed late
- **THEN** the name "Ana" stays held by the new session

#### Scenario: Departure processed by another replica
- **GIVEN** two Meet replicas sharing Redis
- **WHEN** replica B processes the departure of a session whose name replica A reserved
- **THEN** the name is freed exactly as if A had processed it
