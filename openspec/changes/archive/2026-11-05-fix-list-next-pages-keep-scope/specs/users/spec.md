## MODIFIED Requirements

### Requirement: Filter users
The server SHALL narrow `getUsers` by `role`, by exact `userId`, and by `name` matched as `nameMatchMode` says (`exact` by default, `prefix`, `partial` or `regex`), case-sensitively unless `nameCaseInsensitive` is `true`. When both `userId` and `name` are given, a user matching either one is returned. Every page SHALL apply the same filters as the first.

#### Scenario: Partial name match
- **GIVEN** users named `Alice Smith` and `Bob Smith`
- **WHEN** a caller calls `getUsers` with `name` `smith`, `nameMatchMode` `partial` and `nameCaseInsensitive` `true`
- **THEN** both users are returned

#### Scenario: Search by user ID or name
- **GIVEN** a user `alice_smith` named `Alice` and a user `bob_jones` named `alice`
- **WHEN** a caller calls `getUsers` with `userId` `alice_smith`, `name` `alice` and `nameMatchMode` `prefix`
- **THEN** both users are returned

#### Scenario: Search by user ID or name across pages
- **GIVEN** a user `alice_smith`, a user named `Bob` and other users registered before them
- **WHEN** a caller pages through `getUsers` with `userId` `alice_smith`, `name` `Bob`, `nameMatchMode` `prefix` and `maxItems` 1
- **THEN** the pages together hold those two users only

#### Scenario: Invalid regular expression
- **WHEN** a caller calls `getUsers` with `nameMatchMode` `regex` and a `name` that is not a valid regular expression or is longer than 100 characters
- **THEN** the server answers `422` naming `name`
