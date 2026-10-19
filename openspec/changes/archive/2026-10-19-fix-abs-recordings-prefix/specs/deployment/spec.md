## MODIFIED Requirements

### Requirement: Storage provider selection
Meet SHALL use the object storage selected by `MEET_BLOB_STORAGE_MODE`: `s3` (default, any S3-compatible service), `gcs` (Google Cloud Storage) or `abs` (Azure Blob Storage). It SHALL use the bucket `MEET_S3_BUCKET` (S3 and GCS, default `openvidu-appdata`) or the container `MEET_AZURE_CONTAINER_NAME` (ABS, default `openvidu-appdata`), under the prefix `MEET_S3_SUBBUCKET` or `MEET_AZURE_SUBCONTAINER_NAME` (default `openvidu-meet`), where recordings are written and read.

#### Scenario: Google Cloud Storage reuses the S3 bucket variables
- **GIVEN** `MEET_BLOB_STORAGE_MODE=gcs` and `MEET_S3_BUCKET=my-bucket`
- **WHEN** Meet reads a recording file
- **THEN** it reads it from the GCS bucket `my-bucket` under the `openvidu-meet` prefix

#### Scenario: Azure recordings under the Azure prefix
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs`, `MEET_AZURE_SUBCONTAINER_NAME=meet-recordings` and `MEET_S3_SUBBUCKET` left at its default
- **WHEN** a recording completes
- **THEN** its file is written under the `meet-recordings` prefix of the container
- **AND** `getRecordingMedia` serves it

#### Scenario: Prefix that begins the recordings path
- **GIVEN** `MEET_S3_SUBBUCKET=rec`
- **WHEN** a recording completes
- **THEN** its file is written under the `rec` prefix of the bucket
- **AND** `getRecordingMedia` serves it
