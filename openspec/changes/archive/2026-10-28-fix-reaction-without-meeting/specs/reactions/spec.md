## MODIFIED Requirements

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
