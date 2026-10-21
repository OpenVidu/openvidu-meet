## ADDED Requirements

### Requirement: Root admin configuration validated at startup
Meet SHALL refuse to start, logging which variable is wrong and exiting with a non-zero status, when `MEET_INITIAL_ADMIN_USER` is shorter than 5 characters, or when no account has that `userId` yet and `MEET_INITIAL_ADMIN_PASSWORD` is shorter than 5 characters. A `MEET_INITIAL_ADMIN_PASSWORD` of any length is accepted when the root admin account already exists.

#### Scenario: Short root admin user ID
- **GIVEN** `MEET_INITIAL_ADMIN_USER` set to `root`
- **WHEN** Meet starts
- **THEN** it logs that `MEET_INITIAL_ADMIN_USER` must be at least 5 characters long and exits with a non-zero status

#### Scenario: Short password on the first start
- **GIVEN** an empty database and `MEET_INITIAL_ADMIN_PASSWORD` set to `1234`
- **WHEN** Meet starts
- **THEN** it logs that `MEET_INITIAL_ADMIN_PASSWORD` must be at least 5 characters long and exits with a non-zero status
- **AND** no root admin account is created

#### Scenario: Short password with an existing root admin
- **GIVEN** a deployment whose root admin account exists
- **WHEN** Meet restarts with `MEET_INITIAL_ADMIN_PASSWORD` set to `1234`
- **THEN** Meet starts and the root admin keeps its password
