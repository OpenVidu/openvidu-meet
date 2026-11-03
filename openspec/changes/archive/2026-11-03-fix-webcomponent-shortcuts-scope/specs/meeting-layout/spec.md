## MODIFIED Requirements

### Requirement: Fullscreen
More options > Fullscreen and the F11 key SHALL toggle the meeting into and out of fullscreen, and menus, dialogs and notifications SHALL stay visible while in fullscreen. Inside `<openvidu-meet>`, F11 SHALL act only with the focus inside the element.

#### Scenario: Menu in fullscreen
- **GIVEN** a meeting in fullscreen
- **WHEN** the participant opens the More options menu
- **THEN** the menu is visible and offers to exit fullscreen

#### Scenario: F11 on the host page
- **GIVEN** a meeting inside `<openvidu-meet>`, with the focus on an element of the host page
- **WHEN** the participant presses F11
- **THEN** the meeting does not handle the key
