## ADDED Requirements

### Requirement: A failed start releases the seeding locks
When startup fails while seeding the initial data, the server SHALL release every lock it holds before exiting, so a replica restarted right after starts, or fails with its own configuration error, never with a lock error. A lock left by a replica that died SHALL be waited out rather than reported as a conflict.

#### Scenario: Restart right after a configuration error
- **GIVEN** a start that failed because `MEET_INITIAL_ADMIN_USER` is shorter than 5 characters
- **WHEN** Meet is restarted one second later with a valid configuration
- **THEN** it starts normally

#### Scenario: API key lock left by a dead replica
- **GIVEN** a replica that died while holding the API key lock
- **WHEN** a client calls `createApiKey` before the lock expires
- **THEN** the request waits for the lock and answers `201`
