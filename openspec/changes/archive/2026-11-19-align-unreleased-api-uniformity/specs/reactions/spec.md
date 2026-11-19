## MODIFIED Requirements

### Requirement: Send a reaction

`POST /internal-api/v1/meetings/{roomId}/reactions` (`participantSendReaction`) SHALL relay a reaction on behalf of the participant who holds the room member token, showing it to everyone in the meeting, the sender included. The reaction SHALL be relayed by the server; a reaction published by a participant directly SHALL be ignored by the other participants' meetings. When the room has no meeting running, it SHALL answer 404 and relay nothing.

#### Scenario: Reaction reaches everyone

- **GIVEN** a meeting with three participants, all holding `participantSendReaction`
- **WHEN** one of them sends `clapping_hands`
- **THEN** the request answers 200 and all three see the reaction on the sender

#### Scenario: Forged reaction

- **GIVEN** a participant able to send data messages in the meeting
- **WHEN** they publish a message imitating a relayed reaction of another participant
- **THEN** no participant shows that reaction

#### Scenario: No meeting running

- **GIVEN** a room member token holding `participantSendReaction` for a room whose meeting has ended
- **WHEN** it is used to send `thumbs_up`
- **THEN** the request answers 404

### Requirement: Who may send a reaction

The reactions endpoint SHALL accept only a room member token of a participant of that room's meeting holding `participantSendReaction`: without credentials or with an API key it SHALL answer 401, and with a token that lacks the permission or names no participant it SHALL answer 403.

#### Scenario: Without the permission

- **GIVEN** a participant whose permissions deny `participantSendReaction`
- **WHEN** they send a reaction through the endpoint
- **THEN** the server answers 403

#### Scenario: Token that does not join the meeting

- **GIVEN** a room member token obtained without joining the meeting
- **WHEN** it is used to send a reaction
- **THEN** the server answers 403

#### Scenario: API key

- **WHEN** a backend calls the endpoint with the API key
- **THEN** the server answers 401

### Requirement: Reaction command

The embedded command `participantSendReaction(reaction)` SHALL send a reaction on behalf of the local participant, gated by `participantSendReaction`. A value outside the set of reactions SHALL be ignored.

#### Scenario: Host sends a reaction

- **GIVEN** an embedded participant holding `participantSendReaction`
- **WHEN** the host calls `participantSendReaction('thumbs_up')`
- **THEN** every participant sees the thumbs up on that participant

#### Scenario: Command without the permission

- **GIVEN** an embedded participant without `participantSendReaction`
- **WHEN** the host calls `participantSendReaction('thumbs_up')`
- **THEN** the command is rejected and nobody sees a reaction

### Requirement: At most one reaction per second

A participant's meeting SHALL send at most one reaction to the server per second and wait for the server's answer before sending the next. Reactions picked in between SHALL replace each other on the sender's screen and only the last one SHALL be sent when that time ends. The `participantSendReaction` command SHALL follow the same rule.

#### Scenario: Quick burst of reactions

- **GIVEN** a participant in a meeting
- **WHEN** they pick five reactions within half a second
- **THEN** the first and the last are sent, and the others only showed briefly on their own screen

### Requirement: Where reactions show

Every participant SHALL see each reaction on the sender's camera tile and in the participants panel in place of the sender's avatar, and counted in the status rail, which lists every reaction on screen with how many participants show it, the most common first and ties in the order of the set, and opens the participants panel when clicked. Seeing reactions SHALL NOT require any permission.

#### Scenario: Class pulse

- **GIVEN** three participants showing `thumbs_up` and one showing `confused_face`
- **WHEN** a participant looks at the status rail
- **THEN** it shows `thumbs_up` 3 before `confused_face` 1

#### Scenario: Participant without the permission still sees reactions

- **GIVEN** a participant without `participantSendReaction`
- **WHEN** another participant sends a reaction
- **THEN** they see it on the sender's tile and in the panel

### Requirement: Reaction picker

For a participant holding `participantSendReaction` in a room with reactions on, the toolbar SHALL offer a Reactions button right after Raise hand, whose picker of the eight reactions opens on hover or on click; when the toolbar is compact (see `meeting-layout`) the toolbar SHALL instead offer a Reactions row inside More options, which unfolds the eight reactions as a tray without closing the menu, and sending a reaction SHALL close the menu, and the tray SHALL be folded every time the menu opens. Without the permission the button and the row SHALL be hidden.

#### Scenario: Pick with the mouse

- **GIVEN** a participant holding `participantSendReaction` on a desktop browser
- **WHEN** they hover over the Reactions button and click `thumbs_up`
- **THEN** `thumbs_up` is sent

#### Scenario: Pick in the compact toolbar

- **GIVEN** a participant holding `participantSendReaction` with a compact toolbar
- **WHEN** they open More options
- **THEN** the menu shows a Reactions row and no reaction yet
- **WHEN** they tap the Reactions row and then `thumbs_up`
- **THEN** `thumbs_up` is sent and the menu closes

#### Scenario: Tray folds when the menu closes

- **GIVEN** a participant with a compact toolbar who has unfolded the Reactions tray
- **WHEN** they dismiss the menu without sending a reaction and open it again
- **THEN** the Reactions row is folded

#### Scenario: Button hidden without the permission

- **GIVEN** a participant whose permissions deny `participantSendReaction`
- **WHEN** they join the meeting
- **THEN** the toolbar shows no Reactions button

### Requirement: Reaction keyboard shortcuts

The `E` key SHALL open the reaction picker; while it is open, keys `1` to `8` SHALL send the reaction in that place of the set and close it, and Escape SHALL close it. These keys SHALL be ignored while typing in a text field, with Ctrl, Cmd or Alt held, and inside `<openvidu-meet>` when the focus is outside the element.

#### Scenario: Keyboard pick

- **GIVEN** a participant holding `participantSendReaction` on a desktop browser
- **WHEN** they press `E` and then `3`
- **THEN** `grinning_face` is sent and the picker closes

#### Scenario: Typing in the chat

- **WHEN** a participant types "e" and digits in the chat input
- **THEN** no picker opens and no reaction is sent

#### Scenario: Key pressed on the host page

- **GIVEN** a participant in a meeting inside `<openvidu-meet>`, with the focus on a button of the host page
- **WHEN** they press `E`
- **THEN** no picker opens
