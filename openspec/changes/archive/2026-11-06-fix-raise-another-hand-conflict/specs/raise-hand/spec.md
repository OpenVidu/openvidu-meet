## MODIFIED Requirements

### Requirement: Raise hand can be turned off per room
Raise hand SHALL be enabled in new rooms unless `raiseHand.enabled` is set to `false`. While it is `false`, the server SHALL reject with 403 every raise of the caller's own hand, and the meeting SHALL NOT show the raise hand button; lowering a hand SHALL still be allowed. A raise of another participant's hand SHALL get the 409 of "Only its owner raises a hand" whether the feature is on or off.

#### Scenario: Raise rejected in a room with the feature off
- **GIVEN** a room with `raiseHand.enabled` false and a participant in its meeting
- **WHEN** the participant asks to raise their hand through the REST API
- **THEN** the request answers 403

#### Scenario: Button hidden
- **GIVEN** a room with `raiseHand.enabled` false
- **WHEN** a participant joins its meeting
- **THEN** the toolbar shows no raise hand button

### Requirement: Only its owner raises a hand
Raising a hand that is not the caller's own SHALL be rejected with 409, whatever the caller's permissions: a participant holding `participantHandLower`, one without it and an API key alike. A room member token of another room SHALL get 403 instead, as for every other operation on the room.

#### Scenario: Moderator tries to raise a speaker's hand
- **GIVEN** a moderator holding `participantHandLower`
- **WHEN** they send `raised: true` for a speaker
- **THEN** the request answers 409

#### Scenario: Speaker tries to raise another speaker's hand
- **GIVEN** two speakers without `participantHandLower`
- **WHEN** one sends `raised: true` for the other
- **THEN** the request answers 409 and the hand stays down

#### Scenario: API key tries to raise a hand
- **WHEN** a backend sends `raised: true` for a participant with the API key
- **THEN** the request answers 409

#### Scenario: Token of another room
- **WHEN** a room member token of room A sends `raised: true` for a participant of the meeting of room B
- **THEN** the request answers 403 and the hand stays down

### Requirement: Hand request validation
`participantHandUpdate` SHALL answer 422 when `raised` is not a boolean, and 404 when the room has no meeting running or the participant is not in it. A room without a meeting running SHALL be answered 404 before the 409 of a raise of someone else's hand.

#### Scenario: Missing boolean
- **WHEN** a client sends `{ "raised": "yes" }`
- **THEN** the request answers 422

#### Scenario: Participant not in the meeting
- **WHEN** a client lowers the hand of an identity that is not in the meeting
- **THEN** the request answers 404

#### Scenario: Room without a meeting
- **GIVEN** a room with no meeting running
- **WHEN** a moderator of that room sends `raised: true` for another identity
- **THEN** the request answers 404
