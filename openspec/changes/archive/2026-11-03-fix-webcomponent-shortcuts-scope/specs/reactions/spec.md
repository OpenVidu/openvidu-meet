## MODIFIED Requirements

### Requirement: Reaction keyboard shortcuts
The `E` key SHALL open the reaction picker; while it is open, keys `1` to `8` SHALL send the reaction in that place of the set and close it, and Escape SHALL close it. These keys SHALL be ignored while typing in a text field, with Ctrl, Cmd or Alt held, and inside `<openvidu-meet>` when the focus is outside the element.

#### Scenario: Keyboard pick
- **GIVEN** a participant holding `participantReactionSend` on a desktop browser
- **WHEN** they press `E` and then `3`
- **THEN** `grinning_face` is sent and the picker closes

#### Scenario: Typing in the chat
- **WHEN** a participant types "e" and digits in the chat input
- **THEN** no picker opens and no reaction is sent

#### Scenario: Key pressed on the host page
- **GIVEN** a participant in a meeting inside `<openvidu-meet>`, with the focus on a button of the host page
- **WHEN** they press `E`
- **THEN** no picker opens
