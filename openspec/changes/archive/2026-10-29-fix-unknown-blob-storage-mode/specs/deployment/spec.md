## ADDED Requirements

### Requirement: Storage mode values
Meet SHALL read `MEET_BLOB_STORAGE_MODE` ignoring letter case and surrounding spaces, SHALL use S3 storage when it is unset or empty, and SHALL refuse to start with any value other than `s3`, `gcs` or `abs`, naming the variable and the accepted values.

#### Scenario: Value in another case
- **GIVEN** `MEET_BLOB_STORAGE_MODE=GCS`
- **WHEN** Meet starts
- **THEN** it uses Google Cloud Storage

#### Scenario: Unknown value
- **GIVEN** `MEET_BLOB_STORAGE_MODE=gsc`
- **WHEN** Meet starts
- **THEN** it logs that `MEET_BLOB_STORAGE_MODE` must be `s3`, `gcs` or `abs` and exits with a non-zero status, without serving

#### Scenario: Unset value
- **GIVEN** `MEET_BLOB_STORAGE_MODE` is unset or empty
- **WHEN** Meet starts
- **THEN** it uses S3 storage
