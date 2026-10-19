## MODIFIED Requirements

### Requirement: Downloading several recordings as a ZIP
`downloadRecordings` SHALL accept up to 100 distinct `recordingIds` and answer `422` to more, SHALL
answer with a `recordings.zip` attachment holding the requested recordings the caller may download
(`recordingDownload`, checked per recording) and that are `complete`, leaving the others out, and
SHALL answer `400` when the caller may download none of them. The app SHALL NOT offer the ZIP
download for a selection of more than 100 recordings.

#### Scenario: Mixed rooms with a room member token
- **GIVEN** a room member token of room A holding `recordingDownload`
- **WHEN** it calls `downloadRecordings` for one recording of room A and one of room B
- **THEN** the ZIP holds only the recording of room A

#### Scenario: Nothing downloadable
- **WHEN** `downloadRecordings` is called with ids of recordings the caller may not download
- **THEN** the REST API answers `400`

#### Scenario: Too many ids
- **WHEN** `downloadRecordings` is called with 101 distinct recording ids
- **THEN** the REST API answers `422` and builds no ZIP

#### Scenario: Large selection in the app
- **GIVEN** a user who selected 101 complete recordings in a recordings list of the app
- **WHEN** the user looks at the bulk actions
- **THEN** the ZIP download is disabled with an explanation of the 100-recording limit

### Requirement: Deleting recordings in bulk
`bulkDeleteRecordings` SHALL accept up to 100 distinct `recordingIds` and answer `422` to more,
SHALL delete every requested recording the caller may delete (`recordingDelete`, checked per
recording) whose status is final, SHALL answer `200` when all of them were deleted, and SHALL
otherwise answer `400` listing the deleted ids and each failed id with its reason, keeping the
deletions it made. The app SHALL NOT offer bulk delete for a selection of more than 100.

#### Scenario: All deleted
- **WHEN** `bulkDeleteRecordings` is called with ids of finished recordings the caller may delete
- **THEN** the REST API answers `200` and every one of them is deleted

#### Scenario: Partial result
- **WHEN** `bulkDeleteRecordings` is called with one finished recording, one active recording and one unknown id
- **THEN** the REST API answers `400` with the finished one in `deleted` and the other two in `failed`
- **AND** the finished recording is deleted

#### Scenario: Too many ids
- **WHEN** `bulkDeleteRecordings` is called with 101 distinct recording ids
- **THEN** the REST API answers `422` and deletes nothing

#### Scenario: Repeated ids
- **WHEN** `bulkDeleteRecordings` is called with the same finished recording id twice
- **THEN** the REST API answers `200` with that recording once in `deleted`

#### Scenario: Large selection in the app
- **GIVEN** a user who selected 101 finished recordings they may delete in a recordings list of the app
- **WHEN** the user looks at the bulk actions
- **THEN** the bulk delete is disabled with an explanation of the 100-recording limit
