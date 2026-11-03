## MODIFIED Requirements

### Requirement: Joining again replaces the earlier session
When a participant joins with an identity already present in the meeting (the same member or user from another tab or device), the earlier session SHALL be disconnected with reason `duplicate_identity`. A session of a member or user SHALL get the name it asks for when only an earlier session of the same identity holds it, and otherwise the suffixed name such a session holds, even before that session's departure is processed; that departure SHALL NOT free the name the new session holds.

#### Scenario: Same member in a second tab
- **GIVEN** a room member in the meeting
- **WHEN** the same member joins from a second browser tab
- **THEN** the first tab leaves the meeting with reason `duplicate_identity`

#### Scenario: Second tab keeps the name
- **GIVEN** a room member named "Ana" in the meeting
- **WHEN** the same member joins as "Ana" from a second browser tab
- **THEN** the new session is named "Ana", not "Ana_1"

#### Scenario: Second tab keeps a suffixed name
- **GIVEN** an anonymous participant named "Ana" and a room member who joined as "Ana" and was named "Ana_1"
- **WHEN** the same member joins as "Ana" again, from a second browser tab or after reloading
- **THEN** the new session is named "Ana_1", not "Ana_2"
- **AND** once the earlier session's departure is processed, another participant joining as "Ana" is named "Ana_2"

#### Scenario: Quick rejoin
- **GIVEN** a room member named "Ana" who has just left the meeting, before their departure is processed
- **WHEN** they join again as "Ana"
- **THEN** they are named "Ana"
- **AND** once the earlier departure is processed, another participant joining as "Ana" is named "Ana_1"

#### Scenario: Departure processed by another replica
- **GIVEN** two Meet replicas sharing Redis, and a room member "Ana" who rejoined through replica A
- **WHEN** replica B processes the departure of Ana's earlier session
- **THEN** the name "Ana" stays held by the new session
