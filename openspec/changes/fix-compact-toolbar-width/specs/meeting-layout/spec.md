## MODIFIED Requirements

### Requirement: Toolbar across screen sizes
When the toolbar buttons do not fit the width of the meeting, in a window or in an embedded element, on any device, the toolbar SHALL turn compact: every toolbar button SHALL stay within the screen, the extra buttons (such as raise hand, reactions and captions) SHALL move into the More options menu, and the panel buttons SHALL collapse into a single Panels menu.

#### Scenario: Narrow desktop window
- **GIVEN** a desktop browser window 390 px wide
- **WHEN** the participant joins a meeting
- **THEN** no toolbar button lies outside the screen
- **AND** the captions control is inside the More options menu

#### Scenario: Tablet width
- **GIVEN** a browser window 820 px wide and a room with the default toolbar
- **WHEN** the participant joins a meeting
- **THEN** the chat and participants buttons are reachable

#### Scenario: Narrow embedded element
- **GIVEN** an `<openvidu-meet>` element 700 px wide in a wider window
- **WHEN** the participant joins a meeting
- **THEN** no toolbar button lies outside the element
