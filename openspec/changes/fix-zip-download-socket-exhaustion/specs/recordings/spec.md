## ADDED Requirements

### Requirement: A ZIP download does not block other downloads
Building the ZIP of `downloadRecordings` SHALL release every stored recording it opened when the ZIP ends, fails or is cancelled by the client, and SHALL NOT prevent other playbacks, downloads and ZIPs on the same replica, whatever the number of recordings in the ZIP, of concurrent ZIPs or of cancelled ones.

#### Scenario: ZIP of 100 recordings
- **GIVEN** 100 complete recordings the caller may download
- **WHEN** `downloadRecordings` is called with their ids
- **THEN** the REST API answers the ZIP holding the 100 recordings

#### Scenario: Concurrent ZIPs
- **GIVEN** two callers who each request a ZIP of 30 recordings at the same time
- **WHEN** both downloads run
- **THEN** both ZIPs complete

#### Scenario: Cancelled ZIP
- **GIVEN** a ZIP of 40 recordings the client cancels after receiving part of it
- **WHEN** another caller then plays or downloads a recording
- **THEN** that playback or download answers normally
