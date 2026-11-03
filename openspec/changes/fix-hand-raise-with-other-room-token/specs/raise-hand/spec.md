## MODIFIED Requirements

### Requirement: Raise or lower the own hand
`PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/hand` (`participantHandUpdate`) with `raised: true` or `false` SHALL raise or lower that participant's hand. A room member token of that room whose participant is the target SHALL need no permission; a room member token of another room SHALL get 403, whatever its identity. The moment a hand goes up SHALL be its `handRaiseDate`.

#### Scenario: Speaker raises and lowers their hand
- **GIVEN** a speaker without `participantHandLower` in a meeting
- **WHEN** they send `raised: true` for their own identity with their room member token, and later `raised: false`
- **THEN** both requests answer 200
- **AND** `participantGet` reports `handRaised` true with a `handRaiseDate` after the first and `handRaised` false after the second

#### Scenario: Token of another room
- **GIVEN** a participant in the meeting of room B whose identity also holds a room member token of room A
- **WHEN** that token of room A sends `raised: true` for that identity in room B
- **THEN** the request answers 403
- **AND** the hand stays down and no `participantHandChanged` webhook is sent
