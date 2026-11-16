## MODIFIED Requirements

### Requirement: Promote a participant

`PUT /api/v1/meetings/{roomId}/participants/{participantIdentity}/role` (`participantUpdateRole`) with `action: upgrade` SHALL make a participant whose role is `speaker` a moderator, adding every moderator permission they lack to their own, for the rest of their session: after leaving or reloading they rejoin with their original permissions. Promoting a participant whose role is already moderator (original, promoted, owner or administrator) SHALL answer 409.

#### Scenario: Speaker promoted

- **GIVEN** a speaker in a running meeting
- **WHEN** a client holding `participantPromote` sends `action: upgrade` for them
- **THEN** the request answers 200 and the participant's role becomes moderator

#### Scenario: Already a moderator

- **GIVEN** a participant who joined as moderator
- **WHEN** a client sends `action: upgrade` for them
- **THEN** the request answers 409

#### Scenario: Promotion lost on reload

- **GIVEN** a speaker promoted during the meeting
- **WHEN** they reload the page and join again
- **THEN** they join with their original speaker permissions

### Requirement: Demote a participant

`participantUpdateRole` with `action: downgrade` SHALL restore the permissions a participant had before being promoted during the meeting. Only participants promoted during the meeting SHALL be demotable; demoting anyone else, original moderators included, SHALL answer 409.

#### Scenario: Promoted participant demoted

- **GIVEN** a speaker promoted during the meeting
- **WHEN** a client holding `participantPromote` sends `action: downgrade` for them
- **THEN** the request answers 200 and they have their original permissions again

#### Scenario: Original moderator cannot be demoted

- **GIVEN** a participant who joined as moderator
- **WHEN** a client sends `action: downgrade` for them
- **THEN** the request answers 409

### Requirement: Role change failures

`participantUpdateRole` SHALL answer 404 when the participant is not in the meeting, 409 when the participant did not join through Meet, and 422 when `action` is missing or is neither `upgrade` nor `downgrade`.

#### Scenario: Invalid action

- **WHEN** a client sends `action: promote`
- **THEN** the request answers 422

#### Scenario: Participant that did not join through Meet

- **GIVEN** an agent connected to the meeting without Meet's join
- **WHEN** a client sends `action: upgrade` for it
- **THEN** the request answers 409
