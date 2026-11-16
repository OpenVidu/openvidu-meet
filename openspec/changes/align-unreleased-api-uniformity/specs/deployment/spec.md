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
- **AND** `recordingGetMedia` serves it

#### Scenario: Prefix that begins the recordings path
- **GIVEN** `MEET_S3_SUBBUCKET=rec`
- **WHEN** a recording completes
- **THEN** its file is written under the `rec` prefix of the bucket
- **AND** `recordingGetMedia` serves it

### Requirement: Any replica serves any request
Meet SHALL keep no state that a later request depends on in the memory of one replica: every request SHALL be served the same whichever replica receives it. Tokens issued by one replica are accepted by every other as `authentication` specifies.

#### Scenario: Room created on one replica, read on another
- **GIVEN** two replicas behind a load balancer
- **WHEN** a room is created through replica A
- **THEN** `roomGet` for that room through replica B returns it

### Requirement: Public URLs from MEET_BASE_URL
When `MEET_BASE_URL` is set, every absolute URL Meet returns (`Location` headers, access URLs, recording URLs, webhook payloads) SHALL start with it, without a trailing slash or a default port (`443` for `https`, `80` for `http`), followed by the base path. Meet SHALL warn at startup when `MEET_BASE_URL` is not a valid URL or contains a path.

#### Scenario: Default port dropped
- **GIVEN** `MEET_BASE_URL=https://example.com:443/` and `MEET_BASE_PATH=/meet`
- **WHEN** a client creates a room with `roomCreate`
- **THEN** the `Location` header starts with `https://example.com/meet/api/v1/rooms/`

#### Scenario: Path in the base URL
- **GIVEN** `MEET_BASE_URL=https://example.com/meet`
- **WHEN** Meet starts
- **THEN** it warns that `MEET_BASE_URL` contains a path and that `MEET_BASE_PATH` is meant for it

### Requirement: Public URLs without MEET_BASE_URL
When `MEET_BASE_URL` is unset, a URL Meet builds while answering a request SHALL use the scheme and host that request was addressed to, and a URL built outside any request (webhook payloads, scheduled tasks) SHALL use `http://localhost:<SERVER_PORT>`, both followed by the base path.

#### Scenario: URL follows the requested host
- **GIVEN** `MEET_BASE_URL` is unset
- **WHEN** a client calls `roomGet` on `https://meet.example.com/meet/api/v1/rooms/{roomId}` through a trusted proxy
- **THEN** the room's access URLs start with `https://meet.example.com/meet/`

#### Scenario: Concurrent requests to different hosts
- **GIVEN** `MEET_BASE_URL` is unset
- **WHEN** concurrent requests for rooms arrive addressed to the hosts `h1.test` and `h2.test`
- **THEN** each response carries access URLs on the host its own request was addressed to

### Requirement: Request body limit
The server SHALL reject a request body larger than 100 kB, on any endpoint and on `/livekit/webhook`, with `413` and a JSON body naming the limit, and SHALL reject a malformed JSON body with `400`.

#### Scenario: Oversized body
- **WHEN** a client sends a 200 kB JSON body to `roomCreate`
- **THEN** the server answers `413` with `error` `Payload Too Large`

#### Scenario: Malformed JSON
- **WHEN** a client sends `{"roomName":` to `roomCreate`
- **THEN** the server answers `400` with `error` `Bad Request`

### Requirement: Recordings always live under the storage prefix
Meet SHALL write and read every recording file under `<prefix>/recordings/<roomId>/`, whatever the value of `MEET_S3_SUBBUCKET` or `MEET_AZURE_SUBCONTAINER_NAME`, including a value that equals or begins with `recordings`.

#### Scenario: Prefix equal to the recordings folder
- **GIVEN** `MEET_S3_SUBBUCKET=recordings`
- **WHEN** a recording completes
- **THEN** its file is written under `recordings/recordings/<roomId>/`
- **AND** `recordingGetMedia` serves it

#### Scenario: Recording made by 3.9 under that prefix
- **GIVEN** `MEET_S3_SUBBUCKET=recordings` and a recording stored by 3.9 under `recordings/recordings/<roomId>/`
- **WHEN** Meet 3.10 serves, downloads or deletes it
- **THEN** it finds the file there
