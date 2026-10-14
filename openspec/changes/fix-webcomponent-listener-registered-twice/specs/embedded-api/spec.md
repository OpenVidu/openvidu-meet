## ADDED Requirements

### Requirement: Listener callbacks are registered once per event
The embedded element SHALL register a callback at most once per event through `on` and `once`: a call with a callback already registered for that event, by either method and not yet removed, SHALL have no effect, so the callback runs once per event and a single `off` with that callback removes it.

#### Scenario: Same callback registered twice
- **GIVEN** a host that called `element.on("participantJoined", callback)` twice
- **WHEN** a participant joins
- **THEN** `callback` runs once

#### Scenario: Removing a callback registered twice
- **GIVEN** a host that called `element.on("participantJoined", callback)` twice and then `element.off("participantJoined", callback)`
- **WHEN** a participant joins
- **THEN** `callback` does not run
