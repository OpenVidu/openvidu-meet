# Reactions Specification

## Purpose

Participants react with one of eight emoji that every participant sees for a few seconds, to give feedback without speaking or writing in the chat. Meeting participants and host applications rely on it.

Surfaces: internal REST API (`participantReactionSend`, `POST /internal-api/v1/meetings/{roomId}/reactions`; `meet-ce/backend/openapi/meetings/internal/`), embedded command `participantReactionSend` and event `participantReactionSent` (`meet-ce/typings/src/embedded/`, values in `meet-ce/typings/src/reaction.ts`), room config `reactions.enabled`, permission `participantReactionSend`, the meeting UI (toolbar picker, camera tiles, participants panel, status rail). No webhook reports reactions. Documented in openvidu.io `docs/meet/features/meetings/reactions.md`.

## Requirements

### Requirement: The set of reactions
Meet SHALL offer exactly eight reactions, in this order: `thumbs_up` (👍), `thumbs_down` (👎), `grinning_face` (😀), `slightly_frowning_face` (🙁), `confused_face` (😕), `face_with_open_mouth` (😮), `clapping_hands` (👏) and `red_heart` (❤️). Every surface SHALL name a reaction by that value (the Unicode CLDR short name of its emoji in snake_case), never by the emoji itself.

#### Scenario: Value outside the set
- **WHEN** a participant sends the reaction `party_popper`
- **THEN** the server answers 422 and nobody sees it

#### Scenario: Emoji instead of the name
- **WHEN** a participant sends the reaction `👍`
- **THEN** the server answers 422

### Requirement: Reactions can be turned off per room
Reactions SHALL be enabled in new rooms unless `reactions.enabled` is set to `false`. While it is `false`, the server SHALL reject every reaction with 403 and the meeting SHALL NOT show the Reactions button.

#### Scenario: Room with reactions off
- **GIVEN** a room with `reactions.enabled` false
- **WHEN** a participant of its meeting sends a reaction
- **THEN** the server answers 403 and nobody sees it
- **AND** the toolbar shows no Reactions button

### Requirement: Send a reaction
`POST /internal-api/v1/meetings/{roomId}/reactions` (`participantReactionSend`) SHALL relay a reaction on behalf of the participant who holds the room member token, showing it to everyone in the meeting, the sender included. The reaction SHALL be relayed by the server; a reaction published by a participant directly SHALL be ignored by the other participants' meetings. When the room has no meeting running, it SHALL answer 404 and relay nothing.

#### Scenario: Reaction reaches everyone
- **GIVEN** a meeting with three participants, all holding `participantReactionSend`
- **WHEN** one of them sends `clapping_hands`
- **THEN** the request answers 200 and all three see the reaction on the sender

#### Scenario: Forged reaction
- **GIVEN** a participant able to send data messages in the meeting
- **WHEN** they publish a message imitating a relayed reaction of another participant
- **THEN** no participant shows that reaction

#### Scenario: No meeting running
- **GIVEN** a room member token holding `participantReactionSend` for a room whose meeting has ended
- **WHEN** it is used to send `thumbs_up`
- **THEN** the request answers 404

### Requirement: Who may send a reaction
The reactions endpoint SHALL accept only a room member token of a participant of that room's meeting holding `participantReactionSend`: without credentials or with an API key it SHALL answer 401, and with a token that lacks the permission or names no participant it SHALL answer 403.

#### Scenario: Without the permission
- **GIVEN** a participant whose permissions deny `participantReactionSend`
- **WHEN** they send a reaction through the endpoint
- **THEN** the server answers 403

#### Scenario: Token that does not join the meeting
- **GIVEN** a room member token obtained without joining the meeting
- **WHEN** it is used to send a reaction
- **THEN** the server answers 403

#### Scenario: API key
- **WHEN** a backend calls the endpoint with the API key
- **THEN** the server answers 401

### Requirement: Reactions are not stored
Reactions SHALL NOT be stored, replayed or reported by any webhook: a participant joining the meeting later SHALL NOT see the reactions sent before they joined.

#### Scenario: Late joiner
- **GIVEN** a participant sent a reaction 3 seconds ago
- **WHEN** another participant joins the meeting
- **THEN** the newcomer does not see that reaction

### Requirement: Reaction command
The embedded command `participantReactionSend(reaction)` SHALL send a reaction on behalf of the local participant, gated by `participantReactionSend`. A value outside the set of reactions SHALL be ignored.

#### Scenario: Host sends a reaction
- **GIVEN** an embedded participant holding `participantReactionSend`
- **WHEN** the host calls `participantReactionSend('thumbs_up')`
- **THEN** every participant sees the thumbs up on that participant

#### Scenario: Command without the permission
- **GIVEN** an embedded participant without `participantReactionSend`
- **WHEN** the host calls `participantReactionSend('thumbs_up')`
- **THEN** the command is rejected and nobody sees a reaction

### Requirement: participantReactionSent embedded event
The embedded element SHALL dispatch `participantReactionSent` to every participant, the sender included, for every reaction relayed in the meeting, carrying the sender's live snapshot and the reaction. Reactions sent before the participant joined SHALL NOT be dispatched.

#### Scenario: Sender and others are told
- **GIVEN** two embedded participants in a meeting
- **WHEN** one of them sends `red_heart`
- **THEN** both hosts receive `participantReactionSent` naming the sender and `red_heart`

### Requirement: At most one reaction per second
A participant's meeting SHALL send at most one reaction to the server per second and wait for the server's answer before sending the next. Reactions picked in between SHALL replace each other on the sender's screen and only the last one SHALL be sent when that time ends. The `participantReactionSend` command SHALL follow the same rule.

#### Scenario: Quick burst of reactions
- **GIVEN** a participant in a meeting
- **WHEN** they pick five reactions within half a second
- **THEN** the first and the last are sent, and the others only showed briefly on their own screen

### Requirement: How long a reaction shows
Each reaction SHALL show for 10 seconds from the moment it arrives. A new reaction from the same participant SHALL replace the one on screen and start its time over. A participant who leaves SHALL take their reaction off screen.

#### Scenario: Reaction fades
- **WHEN** a participant sends a reaction
- **THEN** every participant sees it for 10 seconds, after which it disappears

#### Scenario: Replaced by the next one
- **GIVEN** a participant whose `thumbs_up` is on screen
- **WHEN** they send `clapping_hands`
- **THEN** `clapping_hands` replaces `thumbs_up` and shows for 10 seconds

### Requirement: The sender sees their reaction at once
The sender's own reaction SHALL show the moment they pick it, without waiting for the server, and the Reactions button SHALL wear it while it lasts. If the server rejects it, it SHALL be taken off the sender's screen.

#### Scenario: Rejected reaction
- **GIVEN** a participant whose reaction the server rejects
- **WHEN** the rejection arrives
- **THEN** the reaction disappears from their screen

### Requirement: Where reactions show
Every participant SHALL see each reaction on the sender's camera tile and in the participants panel in place of the sender's avatar, and counted in the status rail, which lists every reaction on screen with how many participants show it, the most common first and ties in the order of the set, and opens the participants panel when clicked. Seeing reactions SHALL NOT require any permission.

#### Scenario: Class pulse
- **GIVEN** three participants showing `thumbs_up` and one showing `confused_face`
- **WHEN** a participant looks at the status rail
- **THEN** it shows `thumbs_up` 3 before `confused_face` 1

#### Scenario: Participant without the permission still sees reactions
- **GIVEN** a participant without `participantReactionSend`
- **WHEN** another participant sends a reaction
- **THEN** they see it on the sender's tile and in the panel

### Requirement: Reaction picker
For a participant holding `participantReactionSend` in a room with reactions on, the toolbar SHALL offer a Reactions button right after Raise hand, whose picker of the eight reactions opens on hover or on click; when the toolbar is compact (see `meeting-layout`) the reactions SHALL be a grid inside More options. Without the permission the button SHALL be hidden.

#### Scenario: Pick with the mouse
- **GIVEN** a participant holding `participantReactionSend` on a desktop browser
- **WHEN** they hover over the Reactions button and click `thumbs_up`
- **THEN** `thumbs_up` is sent

#### Scenario: Button hidden without the permission
- **GIVEN** a participant whose permissions deny `participantReactionSend`
- **WHEN** they join the meeting
- **THEN** the toolbar shows no Reactions button

### Requirement: Reaction keyboard shortcuts
The `E` key SHALL open the reaction picker; while it is open, keys `1` to `8` SHALL send the reaction in that place of the set and close it, and Escape SHALL close it. These keys SHALL be ignored while typing in a text field and with Ctrl, Cmd or Alt held.

#### Scenario: Keyboard pick
- **GIVEN** a participant holding `participantReactionSend` on a desktop browser
- **WHEN** they press `E` and then `3`
- **THEN** `grinning_face` is sent and the picker closes

#### Scenario: Typing in the chat
- **WHEN** a participant types "e" and digits in the chat input
- **THEN** no picker opens and no reaction is sent
