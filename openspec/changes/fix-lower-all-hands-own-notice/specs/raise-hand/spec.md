## MODIFIED Requirements

### Requirement: Lower every hand
`PUT /api/v1/meetings/{roomId}/participants/hand` (`participantHandLowerAll`) with `raised: false` SHALL lower every raised hand in the meeting, the caller's and moderators' included, each as a moderator action except the caller's own hand, which SHALL be attributed to the participant. It SHALL require `participantHandLower`, reject `raised: true` with 422, answer 404 when the room has no meeting running, and succeed when a participant leaves while it runs.

#### Scenario: Every hand lowered
- **GIVEN** three participants with raised hands
- **WHEN** a client holding `participantHandLower` calls `participantHandLowerAll`
- **THEN** every hand is lowered
- **AND** one `participantHandChanged` webhook per hand is sent with `origin` `moderator`

#### Scenario: The caller's own hand is up
- **GIVEN** a moderator holding `participantHandLower` and two speakers, all three with raised hands
- **WHEN** the moderator calls `participantHandLowerAll` with their room member token
- **THEN** every hand is lowered
- **AND** the `participantHandChanged` webhooks of the speakers carry `origin` `moderator` and the moderator's own carries `origin` `participant`
- **AND** the moderator does not see "A moderator lowered your hand"

#### Scenario: Raising every hand is rejected
- **WHEN** a client sends `raised: true` to `participantHandLowerAll`
- **THEN** the request answers 422

#### Scenario: Without the permission
- **GIVEN** a room member token without `participantHandLower`
- **WHEN** it calls `participantHandLowerAll`
- **THEN** the request answers 403
