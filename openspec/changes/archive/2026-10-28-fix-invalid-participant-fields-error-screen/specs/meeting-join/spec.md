## MODIFIED Requirements

### Requirement: Correlation field limits
The server SHALL reject a join whose `participant-external-id` is empty, longer than 64 characters or has characters other than letters, digits, `_` and `-`, or whose `participant-metadata` exceeds 2048 UTF-8 bytes, with `422`, and the participant SHALL NOT enter the meeting. The meeting SHALL then show the "Invalid participant data" error screen and log the server's reason in the browser console.

#### Scenario: External id with a space
- **GIVEN** an embedded element with `participant-external-id="user 42"`
- **WHEN** the participant presses join
- **THEN** the server answers `422` and the participant does not enter the meeting
- **AND** the "Invalid participant data" error screen is shown and the browser console names `participantExternalId`

#### Scenario: Metadata over the byte limit
- **GIVEN** a `participant-metadata` of 2000 characters that takes more than 2048 bytes in UTF-8
- **WHEN** a join token is requested with it
- **THEN** the server answers `422`
