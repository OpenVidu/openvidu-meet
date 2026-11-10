## ADDED Requirements

### Requirement: Recording player offers no download of its own
The recording player, in the console recording detail page and on the recording view page, SHALL open no context menu on the video and SHALL offer no download in its native controls, whatever the viewer holds. Download SHALL be offered only by the app's own action, under the rules of the page that shows the player.

#### Scenario: Right click on the video
- **WHEN** a user opens a recording in the console and right-clicks the video
- **THEN** no context menu opens

#### Scenario: Play-only visitor
- **WHEN** an anonymous visitor opens a play-only recording link and right-clicks the video
- **THEN** no context menu opens and the page offers no download

## MODIFIED Requirements

### Requirement: Shareable recording links
`getRecordingUrl` SHALL require `recordingPlay` and return a link to the recording view page holding one of the recording's secrets, which never change: a public one by default, refused with `403` while the room's `access.anonymous.recording.enabled` is `false`, or a private one with `privateAccess=true`, always available. The link SHALL grant download only when the caller holds `recordingDownload`; otherwise it SHALL grant play only.

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

### Requirement: Access with a recording secret
A public secret SHALL grant access to `getRecording`, `getRecordingMedia` and `downloadRecording` on its own, without any credential, while the room's anonymous recording access is enabled, and `403` while it is disabled. A private secret SHALL waive the recording permission for any authenticated caller and answer `401` without a credential. A play-only secret SHALL answer `403` on `downloadRecording`. An unrecognised secret SHALL answer `400` whatever credential comes with it.

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

### Requirement: Downloading a recording
`downloadRecording` SHALL serve the same media as `getRecordingMedia`, as an attachment named after the recording's filename (or `{recordingId}.mp4`), gated by `recordingDownload` instead of `recordingPlay`, or by a `recordingSecret` that grants download (see "Access with a recording secret").

#### Scenario: Play granted, download denied
- **GIVEN** a room member token holding `recordingPlay` but not `recordingDownload`
- **WHEN** it calls `getRecordingMedia` and then `downloadRecording` for a recording of its room
- **THEN** the first call answers `200` and the second answers `403`

#### Scenario: Download granted, play denied
- **GIVEN** a room member token holding `recordingDownload` but not `recordingPlay`
- **WHEN** it calls `downloadRecording`
- **THEN** the REST API answers `200` with a `Content-Disposition: attachment` header

### Requirement: Recording view page
The page `/recording/{recordingId}` SHALL play a `complete` recording, or show its status otherwise, to a visitor holding `recordingPlay` in its room or bringing a valid `recordingSecret`. It SHALL offer download to a visitor bringing a secret only when that secret grants download, to any other visitor only with `recordingDownload`, and delete with `recordingDelete`. A visitor with a private link and no session SHALL be sent to log in and back.

#### Scenario: Public link
- **WHEN** an anonymous visitor opens a public recording link that grants download
- **THEN** the page plays the recording and offers to download it

#### Scenario: Play-only link
- **WHEN** an anonymous visitor opens a public recording link created by a member without `recordingDownload`
- **THEN** the page plays the recording and offers no download

#### Scenario: Play-only link opened by a member allowed to download
- **GIVEN** a registered user whose permissions in the recording's room hold `recordingDownload`
- **WHEN** the user, logged in, opens a play-only recording link
- **THEN** the page plays the recording and offers no download

#### Scenario: Private link without a session
- **WHEN** a visitor without a session opens a private recording link
- **THEN** the visitor is sent to the login page and returns to the recording after logging in

#### Scenario: Unknown secret
- **WHEN** a visitor opens a recording link whose secret is not recognised
- **THEN** an error page is shown
