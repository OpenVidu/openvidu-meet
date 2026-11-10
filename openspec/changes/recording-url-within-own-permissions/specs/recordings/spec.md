## MODIFIED Requirements

### Requirement: Shareable recording links
`getRecordingUrl` SHALL require `recordingPlay` and return a link to the recording view page holding one of the recording's secrets, all created with the recording and never changed: a public one by default, refused with `403` while the room's `access.anonymous.recording.enabled` is `false`, or a private one with `privateAccess=true`, always available. The link SHALL grant download only when the caller holds `recordingDownload`; otherwise it SHALL grant play only.

#### Scenario: Public link
- **GIVEN** a room with anonymous recording access enabled
- **WHEN** `getRecordingUrl` is called for one of its recordings
- **THEN** the REST API answers `200` with a `/recording/{recordingId}?recordingSecret=...` link

#### Scenario: Public link with anonymous recording access disabled
- **GIVEN** a room with `access.anonymous.recording.enabled` set to `false`
- **WHEN** `getRecordingUrl` is called without `privateAccess`
- **THEN** the REST API answers `403`
- **AND** the same call with `privateAccess=true` answers `200`

#### Scenario: Caller allowed to play but not to download
- **GIVEN** a room member whose permissions hold `recordingPlay` but not `recordingDownload`
- **WHEN** they call `getRecordingUrl` for a recording of that room, with or without `privateAccess`
- **THEN** the REST API answers `200` with a link whose holder can play the recording
- **AND** `downloadRecording` with that link's secret answers `403`

#### Scenario: Caller allowed to download
- **GIVEN** a caller holding `recordingPlay` and `recordingDownload`, such as an API key, an `admin` user or the room's owner
- **WHEN** they call `getRecordingUrl` for a recording of that room
- **THEN** the link's holder can play and download the recording

#### Scenario: Links shared before this release
- **GIVEN** a public link to a recording obtained before this release
- **WHEN** `downloadRecording` is called with its secret
- **THEN** the REST API answers `200`, as before

#### Scenario: Several replicas
- **GIVEN** two Meet replicas sharing the deployment
- **WHEN** replica A returns a play-only link and replica B serves a request carrying its secret
- **THEN** replica B grants play and refuses download, as replica A would

### Requirement: Access with a recording secret
For `getRecording`, `getRecordingMedia` and `downloadRecording`, a public secret SHALL grant access on its own, without any credential, while the room's anonymous recording access is enabled, and `403` while it is disabled. A private secret SHALL waive the recording permission for a caller authenticated by any credential and answer `401` without one. A play-only secret SHALL grant nothing for `downloadRecording`, which answers `403`. An unrecognised secret SHALL answer `400` whatever credential comes with it.

#### Scenario: Public secret without credentials
- **WHEN** `getRecordingMedia` is called with the public secret and no credential
- **THEN** the REST API answers `200`

#### Scenario: Anonymous recording access disabled after sharing
- **GIVEN** a public link issued while anonymous recording access was enabled
- **WHEN** the room's `access.anonymous.recording.enabled` becomes `false` and the link is used, with or without credentials
- **THEN** the REST API answers `403`
- **AND** the link works again once anonymous recording access is enabled again

#### Scenario: Private secret
- **GIVEN** a registered user with no access to the recording's room
- **WHEN** the user calls `getRecording` with the private secret
- **THEN** the REST API answers `200`
- **AND** the same call without any credential answers `401`

#### Scenario: Play-only public secret
- **WHEN** `getRecordingMedia` is called with a play-only public secret and no credential
- **THEN** the REST API answers `200`
- **AND** `downloadRecording` with the same secret answers `403`

#### Scenario: Play-only private secret
- **GIVEN** a registered user with no access to the recording's room
- **WHEN** the user calls `getRecordingMedia` and then `downloadRecording` with a play-only private secret
- **THEN** the REST API answers `200` to the first and `403` to the second

#### Scenario: Unrecognised secret
- **WHEN** `getRecording` is called with a `recordingSecret` that is not one of the recording's secrets, even with an API key
- **THEN** the REST API answers `400`

### Requirement: Recording view page
The page `/recording/{recordingId}` SHALL play a `complete` recording, or show its status otherwise, to a visitor holding `recordingPlay` in its room or bringing a valid `recordingSecret`. It SHALL offer download with `recordingDownload` or a secret that grants download, and delete with `recordingDelete`. A visitor with a private link and no session SHALL be sent to log in and back.

#### Scenario: Public link
- **WHEN** an anonymous visitor opens a public recording link that grants download
- **THEN** the page plays the recording and offers to download it

#### Scenario: Play-only link
- **WHEN** an anonymous visitor opens a public recording link created by a member without `recordingDownload`
- **THEN** the page plays the recording and offers no download
- **AND** its share dialog offers that same link

#### Scenario: Private link without a session
- **WHEN** a visitor without a session opens a private recording link
- **THEN** the visitor is sent to the login page and returns to the recording after logging in

#### Scenario: Unknown secret
- **WHEN** a visitor opens a recording link whose secret is not recognised
- **THEN** an error page is shown
