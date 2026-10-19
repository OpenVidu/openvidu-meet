## ADDED Requirements

### Requirement: Raised-hand notice in encrypted meetings
In a meeting of an end-to-end encrypted room, the raised-hand notice SHALL name each participant as the participants panel shows them: their decrypted name when they share the holder's encryption key, and the masked name when they do not. It SHALL never show an encrypted name.

#### Scenario: Same encryption key
- **GIVEN** an encrypted meeting where a moderator holding `participantHandLower` and Ana joined with the same encryption key
- **WHEN** Ana raises her hand
- **THEN** the moderator's notice reads "Ana raised their hand"

#### Scenario: Different encryption key
- **GIVEN** an encrypted meeting where a moderator holding `participantHandLower` and Ana joined with different encryption keys
- **WHEN** Ana raises her hand
- **THEN** the moderator's notice names her as `******`
