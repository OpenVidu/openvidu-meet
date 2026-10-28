## MODIFIED Requirements

### Requirement: Joining again replaces the earlier session
When a participant joins with an identity already present in the meeting (the same member or user from another tab or device), the earlier session SHALL be disconnected with reason `duplicate_identity`. A session of a member or user SHALL get the name it asks for when that name is held only by an earlier session of the same identity, even before that session's departure is processed, and that departure SHALL NOT free the name the new session holds.

#### Scenario: Same member in a second tab
- **GIVEN** a room member in the meeting
- **WHEN** the same member joins from a second browser tab
- **THEN** the first tab leaves the meeting with reason `duplicate_identity`

#### Scenario: Second tab keeps the name
- **GIVEN** a room member named "Ana" in the meeting
- **WHEN** the same member joins as "Ana" from a second browser tab
- **THEN** the new session is named "Ana", not "Ana_1"

#### Scenario: Quick rejoin
- **GIVEN** a room member named "Ana" who has just left the meeting, before their departure is processed
- **WHEN** they join again as "Ana"
- **THEN** they are named "Ana"
- **AND** once the earlier departure is processed, another participant joining as "Ana" is named "Ana_1"

#### Scenario: Departure processed by another replica
- **GIVEN** two Meet replicas sharing Redis, and a room member "Ana" who rejoined through replica A
- **WHEN** replica B processes the departure of Ana's earlier session
- **THEN** the name "Ana" stays held by the new session
