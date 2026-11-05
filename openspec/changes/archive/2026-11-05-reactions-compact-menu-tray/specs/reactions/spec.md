## MODIFIED Requirements

### Requirement: Reaction picker
For a participant holding `participantReactionSend` in a room with reactions on, the toolbar SHALL offer a Reactions button right after Raise hand, whose picker of the eight reactions opens on hover or on click; when the toolbar is compact (see `meeting-layout`) the toolbar SHALL instead offer a Reactions row inside More options, which unfolds the eight reactions as a tray without closing the menu, and sending a reaction SHALL close the menu, and the tray SHALL be folded every time the menu opens. Without the permission the button and the row SHALL be hidden.

#### Scenario: Pick with the mouse
- **GIVEN** a participant holding `participantReactionSend` on a desktop browser
- **WHEN** they hover over the Reactions button and click `thumbs_up`
- **THEN** `thumbs_up` is sent

#### Scenario: Pick in the compact toolbar
- **GIVEN** a participant holding `participantReactionSend` with a compact toolbar
- **WHEN** they open More options
- **THEN** the menu shows a Reactions row and no reaction yet
- **WHEN** they tap the Reactions row and then `thumbs_up`
- **THEN** `thumbs_up` is sent and the menu closes

#### Scenario: Tray folds when the menu closes
- **GIVEN** a participant with a compact toolbar who has unfolded the Reactions tray
- **WHEN** they dismiss the menu without sending a reaction and open it again
- **THEN** the Reactions row is folded

#### Scenario: Button hidden without the permission
- **GIVEN** a participant whose permissions deny `participantReactionSend`
- **WHEN** they join the meeting
- **THEN** the toolbar shows no Reactions button
