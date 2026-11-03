## ADDED Requirements

### Requirement: A replaced element does not disturb its replacement
When a host replaces an `<openvidu-meet>` element with a new one, the new element SHALL show its own room or recording, whatever the element it replaces is still doing while it is being removed.

#### Scenario: Element replaced by one on another room
- **GIVEN** an element showing the join screen of room A
- **WHEN** the host removes it and immediately adds a new element on room B
- **THEN** the new element shows the join screen of room B and no error
