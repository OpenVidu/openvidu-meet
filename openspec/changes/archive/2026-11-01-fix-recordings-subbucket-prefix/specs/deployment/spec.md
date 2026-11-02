## ADDED Requirements

### Requirement: Recordings always live under the storage prefix
Meet SHALL write and read every recording file under `<prefix>/recordings/<roomId>/`, whatever the value of `MEET_S3_SUBBUCKET` or `MEET_AZURE_SUBCONTAINER_NAME`, including a value that equals or begins with `recordings`.

#### Scenario: Prefix equal to the recordings folder
- **GIVEN** `MEET_S3_SUBBUCKET=recordings`
- **WHEN** a recording completes
- **THEN** its file is written under `recordings/recordings/<roomId>/`
- **AND** `getRecordingMedia` serves it

#### Scenario: Recording made by 3.9 under that prefix
- **GIVEN** `MEET_S3_SUBBUCKET=recordings` and a recording stored by 3.9 under `recordings/recordings/<roomId>/`
- **WHEN** Meet 3.10 serves, downloads or deletes it
- **THEN** it finds the file there
