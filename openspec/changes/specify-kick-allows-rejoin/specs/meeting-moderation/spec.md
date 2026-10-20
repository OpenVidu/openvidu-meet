## ADDED Requirements

### Requirement: A kick does not revoke access
Kicking a participant SHALL only disconnect them from the meeting in progress. Their access to the room SHALL be unchanged: with the same access link, room member token or account they SHALL be able to join that meeting again at once, and later meetings of the room. Keeping a participant out SHALL require revoking their access to the room (see `room-access` and `room-members`).

#### Scenario: Kicked participant joins again
- **GIVEN** a speaker who entered through the room's speaker link and was kicked
- **WHEN** they open the same link and press Join while the meeting is still running
- **THEN** they enter the meeting again

#### Scenario: Kicked member whose access is revoked
- **GIVEN** an identified guest who was kicked
- **WHEN** a room manager deletes their room member record and they try to join again
- **THEN** they cannot enter the meeting

#### Scenario: Kicked anonymous participant while the meeting runs
- **GIVEN** a speaker who entered through the room's anonymous speaker link and was kicked
- **WHEN** a room manager tries to disable that link while the meeting is still active
- **THEN** the server answers `409` and the speaker can still join again through the link
