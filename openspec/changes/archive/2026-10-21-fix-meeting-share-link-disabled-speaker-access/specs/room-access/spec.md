## MODIFIED Requirements

### Requirement: Sharing the room from the meeting
In a meeting opened in the standalone app, a participant holding `roomShareAccessLinks` SHALL be offered the room's anonymous speaker link to copy while that link is enabled: on the join screen while the room is not closed, in a toolbar button, at the top of the participants panel and in an overlay shown while they are alone. The link SHALL be displayed as the host and path of the user access link. Embedded meetings (webcomponent or iframe) SHALL never offer it.

#### Scenario: Moderator alone in the meeting
- **GIVEN** a participant holding `roomShareAccessLinks` alone in a meeting in the standalone app
- **WHEN** they click copy in the overlay
- **THEN** the room's anonymous speaker URL is copied to the clipboard
- **AND** the overlay disappears once another participant joins

#### Scenario: Participant without the permission
- **GIVEN** a participant without `roomShareAccessLinks`
- **WHEN** they are on the join screen or in the meeting
- **THEN** no share link, copy button or share overlay is shown

#### Scenario: Anonymous speaker link disabled
- **GIVEN** a room whose `access.anonymous.speaker.enabled` is `false`
- **AND** a participant holding `roomShareAccessLinks` in its meeting in the standalone app
- **WHEN** they are on the join screen or in the meeting, alone or not
- **THEN** no share link, copy button or share overlay is shown, and the overlay shown while alone says they are waiting for others instead

#### Scenario: Embedded meeting
- **GIVEN** a participant holding `roomShareAccessLinks` in a meeting embedded with the webcomponent
- **WHEN** they are alone in the meeting
- **THEN** no share link is shown and a notice says they are waiting for others instead
