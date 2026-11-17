## RENAMED Requirements

- FROM: `### Requirement: Holders of participantHandLower are notified of raised hands`
- TO: `### Requirement: Holders of participantLowerHand are notified of raised hands`

## MODIFIED Requirements

### Requirement: Raise or lower the own hand

`PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/hand` (`participantUpdateHand`) with `handRaised: true` or `false` SHALL raise or lower that participant's hand. A room member token whose participant is the target SHALL need no permission. The moment a hand goes up SHALL be its `handRaiseDate`.

#### Scenario: Speaker raises and lowers their hand

- **GIVEN** a speaker without `participantLowerHand` in a meeting
- **WHEN** they send `handRaised: true` for their own identity with their room member token, and later `handRaised: false`
- **THEN** both requests answer 200
- **AND** `participantGet` reports `handRaised` true with a `handRaiseDate` after the first and `handRaised` false after the second

### Requirement: Lowering another participant's hand

Lowering a hand that is not the caller's own SHALL require `participantLowerHand` (403 without it) and SHALL be attributed to a moderator. An API key SHALL be able to lower any hand.

#### Scenario: Moderator lowers a speaker's hand

- **GIVEN** a speaker with a raised hand and a moderator holding `participantLowerHand`
- **WHEN** the moderator sends `handRaised: false` for the speaker
- **THEN** the hand is lowered and the change is attributed to a moderator

#### Scenario: Speaker without the permission

- **GIVEN** two speakers without `participantLowerHand`, one with a raised hand
- **WHEN** the other sends `handRaised: false` for that hand
- **THEN** the request answers 403 and the hand stays raised

### Requirement: Only its owner raises a hand

Raising a hand that is not the caller's own SHALL be rejected with 409, whatever the caller's permissions: a participant holding `participantLowerHand`, one without it and an API key alike. A room member token of another room SHALL get 403 instead, as for every other operation on the room.

#### Scenario: Moderator tries to raise a speaker's hand

- **GIVEN** a moderator holding `participantLowerHand`
- **WHEN** they send `handRaised: true` for a speaker
- **THEN** the request answers 409

#### Scenario: Speaker tries to raise another speaker's hand

- **GIVEN** two speakers without `participantLowerHand`
- **WHEN** one sends `handRaised: true` for the other
- **THEN** the request answers 409 and the hand stays down

#### Scenario: API key tries to raise a hand

- **WHEN** a backend sends `handRaised: true` for a participant with the API key
- **THEN** the request answers 409

#### Scenario: Token of another room

- **WHEN** a room member token of room A sends `handRaised: true` for a participant of the meeting of room B
- **THEN** the request answers 403 and the hand stays down

### Requirement: Hand request validation

`participantUpdateHand` SHALL answer 422 when `handRaised` is not a boolean, and 404 when the room has no meeting running or the participant is not in it. A room without a meeting running SHALL be answered 404 before the 409 of a raise of someone else's hand.

#### Scenario: Missing boolean

- **WHEN** a client sends `{ "handRaised": "yes" }`
- **THEN** the request answers 422

#### Scenario: Participant not in the meeting

- **WHEN** a client lowers the hand of an identity that is not in the meeting
- **THEN** the request answers 404

#### Scenario: Room without a meeting

- **GIVEN** a room with no meeting running
- **WHEN** a moderator of that room sends `handRaised: true` for another identity
- **THEN** the request answers 404

### Requirement: Lower every hand

`PUT /api/v1/meetings/{roomId}/participants/hand` (`participantLowerAllHands`) with `handRaised: false` SHALL lower every raised hand in the meeting, the caller's and moderators' included, each as a moderator action. It SHALL require `participantLowerHand`, reject `handRaised: true` with 422, answer 404 when the room has no meeting running, and succeed when a participant leaves while it runs.

#### Scenario: Every hand lowered

- **GIVEN** three participants with raised hands
- **WHEN** a client holding `participantLowerHand` calls `participantLowerAllHands`
- **THEN** every hand is lowered
- **AND** one `participantHandChanged` webhook per hand is sent with `origin` `moderator`

#### Scenario: Raising every hand is rejected

- **WHEN** a client sends `handRaised: true` to `participantLowerAllHands`
- **THEN** the request answers 422

#### Scenario: Without the permission

- **GIVEN** a room member token without `participantLowerHand`
- **WHEN** it calls `participantLowerAllHands`
- **THEN** the request answers 403

### Requirement: Raise hand commands

The embedded command `participantRaiseHand()` SHALL raise the local participant's hand without any permission, rejected by the server while `raiseHand.enabled` is `false`. `participantLowerHand(participantIdentity?)` SHALL lower the local participant's hand, or another participant's when an identity is given, which requires `participantLowerHand`. `participantLowerAllHands()` SHALL lower every hand, gated by `participantLowerHand`.

#### Scenario: Host raises and lowers the own hand

- **GIVEN** an embedded speaker in a meeting
- **WHEN** the host calls `participantRaiseHand()` and then `participantLowerHand()`
- **THEN** every participant sees the speaker's hand go up and then down

#### Scenario: Lowering another hand without the permission

- **GIVEN** an embedded speaker without `participantLowerHand` and another participant with a raised hand
- **WHEN** the host calls `participantLowerHand` with that participant's identity
- **THEN** the command is rejected and the hand stays raised

### Requirement: Holders of participantLowerHand are notified of raised hands

A holder of `participantLowerHand` SHALL hear a sound and see a notice when another participant raises a hand. Hands raised while the notice is on screen SHALL join it ("Ana and 2 more raised their hand"); the notice SHALL shrink as those hands go down or leave, offer Lower hand while it names a single hand, last 5 seconds from its last change, and go away if the holder loses the permission.

#### Scenario: Several hands at once

- **GIVEN** a moderator holding `participantLowerHand`
- **WHEN** Ana and then Ben raise their hands within a few seconds
- **THEN** the moderator sees a single notice "Ana and 1 more raised their hand"
- **AND** once Ana lowers her hand it reads "Ben raised their hand" and offers Lower hand

#### Scenario: Participant without the permission

- **GIVEN** a speaker without `participantLowerHand`
- **WHEN** another participant raises their hand
- **THEN** the speaker gets no raised-hand notice

### Requirement: Lowering hands from the participants panel

A holder of `participantLowerHand` SHALL find Lower hand in the row menu of each remote participant whose hand is up, and, while at least one remote participant's hand is up, a Raised hands strip heading the panel with the number of raised hands and a Lower all hands button. Every participant with a raised hand SHALL find a button on their own row to lower it.

#### Scenario: Lower all from the strip

- **GIVEN** a moderator holding `participantLowerHand` and two speakers with raised hands
- **WHEN** the moderator presses Lower all hands in the panel
- **THEN** both hands are lowered

#### Scenario: Only the own hand is up

- **GIVEN** a moderator whose own hand is the only one raised
- **WHEN** they open the participants panel
- **THEN** no Raised hands strip is shown and their own row offers to lower their hand

### Requirement: Raised-hand notice in encrypted meetings

In a meeting of an end-to-end encrypted room, the raised-hand notice SHALL name each participant as the participants panel shows them: their decrypted name when they share the holder's encryption key, and the masked name when they do not. It SHALL never show an encrypted name.

#### Scenario: Same encryption key

- **GIVEN** an encrypted meeting where a moderator holding `participantLowerHand` and Ana joined with the same encryption key
- **WHEN** Ana raises her hand
- **THEN** the moderator's notice reads "Ana raised their hand"

#### Scenario: Different encryption key

- **GIVEN** an encrypted meeting where a moderator holding `participantLowerHand` and Ana joined with different encryption keys
- **WHEN** Ana raises her hand
- **THEN** the moderator's notice names her as `******`
