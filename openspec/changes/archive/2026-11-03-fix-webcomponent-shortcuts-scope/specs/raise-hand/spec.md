## MODIFIED Requirements

### Requirement: Raise hand from the toolbar and the keyboard
While raise hand is enabled, the meeting SHALL offer a Raise hand button in the toolbar, inside More options when the toolbar is compact (see `meeting-layout`), that raises or lowers the own hand. The `R` key SHALL do the same once per press, and SHALL be ignored while typing in a text field, with Ctrl, Cmd or Alt held, and inside `<openvidu-meet>` when the focus is outside the element.

#### Scenario: Holding the key down
- **GIVEN** a participant with the hand down
- **WHEN** they hold `R` down until the key repeats, then press it once more
- **THEN** the hand goes up once and then down once

#### Scenario: Typing in the chat
- **WHEN** a participant types a message containing "r" in the chat input
- **THEN** their hand does not change

#### Scenario: Key pressed on the host page
- **GIVEN** a participant in a meeting inside `<openvidu-meet>`, with the focus on a button of the host page
- **WHEN** they press `R`
- **THEN** their hand does not change
- **AND** after a click anywhere in the meeting, `R` raises it
