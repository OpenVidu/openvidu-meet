## MODIFIED Requirements

### Requirement: Recording list filtering, sorting and pagination

`recordingList` SHALL filter by `roomId` (which wins over `roomName`), by `roomName` (exact by
default, or prefix, partial or regex match, optionally case-insensitive) and by `status`, which takes
one status or a comma-separated list of statuses and matches the recordings in any of them; SHALL sort
by `startDate` (default, newest first), `roomName`, `duration` or `size`; and SHALL paginate with
`maxItems` (default `10`, values above `100` served as `100`) and `nextPageToken`. Every page SHALL
apply the same filters and the same list scope as the first, whatever `fields` holds.

#### Scenario: Default order

- **WHEN** `recordingList` is called without sort parameters
- **THEN** the recordings come newest `startDate` first, at most 10 per page

#### Scenario: Several statuses

- **GIVEN** recordings that are `starting`, `active`, `ending` and `complete`
- **WHEN** `recordingList` is called with `status=starting,active,ending`
- **THEN** every recording but the `complete` one is listed

#### Scenario: Oversized page

- **WHEN** `recordingList` is called with `maxItems` set to `500`
- **THEN** the page holds at most 100 recordings and reports `maxItems` as `100`

#### Scenario: Later pages keep the caller's scope

- **GIVEN** a `room_member` user whose membership of room A holds `recordingList`, two recordings in room A, and an older recording in a room B the user has no access to
- **WHEN** the user pages through `recordingList` with `maxItems=1`
- **THEN** the pages together hold the two recordings of room A only

#### Scenario: Paging with a field selection

- **GIVEN** two recordings
- **WHEN** `recordingList` is called with `fields=recordingId` and `maxItems=1` and then with the returned `nextPageToken`
- **THEN** the second page holds the other recording, carrying only `recordingId`

#### Scenario: Invalid parameters

- **WHEN** `recordingList` is called with `maxItems` set to `0`, an unknown `status` alone or in a list, or an invalid regular expression in regex mode
- **THEN** the REST API answers `422`

#### Scenario: Invalid page token

- **WHEN** `recordingList` is called with a `nextPageToken` the server did not issue
- **THEN** the REST API answers `400`

### Requirement: Console recordings page

The console's Recordings page, available to `admin`, `room_manager` and `room_member` users, SHALL
list the recordings `recordingList` returns to the user, searchable by room name with the same match
modes, filterable by one or several statuses and sortable. Like a room's Recordings tab, it SHALL enable play and share
(`recordingPlay`) and offer download and ZIP download (`recordingDownload`) and delete and bulk delete
(`recordingDelete`) only for recordings whose room grants the user that permission.

#### Scenario: Admin

- **WHEN** an `admin` user opens the Recordings page
- **THEN** every recording is listed, with download offered for every complete one and delete for every finished one

#### Scenario: Several statuses

- **GIVEN** an `admin` user on the Recordings page
- **WHEN** they choose the `failed` and `aborted` statuses in the status filter
- **THEN** the recordings in either status are listed

#### Scenario: Member without delete permission

- **GIVEN** a `room_member` user holding `recordingList` but not `recordingDelete` in room A
- **WHEN** the user opens the Recordings page
- **THEN** the recordings of room A are listed without a delete action

#### Scenario: Member without play permission

- **GIVEN** a `room_member` user holding `recordingList` but not `recordingPlay` in room A
- **WHEN** the user opens the Recordings page, or the Recordings tab of room A's detail page
- **THEN** the recordings of room A are listed with play and share disabled, and their tooltip names `recordingPlay`

### Requirement: Room recordings page

The page `/room/{roomId}/recordings` SHALL list the room's recordings to a visitor whose access to the
room (an access link secret, a room member or a registered user) holds `recordingList`, filterable by
one or several statuses like the Recordings tab of the room's console detail page, enabling play
and share only with `recordingPlay`, download only with `recordingDownload` and delete only with
`recordingDelete`. Without `recordingList` it SHALL show an error page. The room's anonymous
recording link (see `room-access`) grants list, play and download.

#### Scenario: Anonymous recording link

- **GIVEN** a room with recordings and anonymous recording access enabled
- **WHEN** a visitor opens the room's anonymous recording link
- **THEN** the page lists the room's recordings with play and download but no delete

#### Scenario: Several statuses

- **GIVEN** a room with `complete`, `failed` and `aborted` recordings
- **WHEN** a visitor holding `recordingList` chooses the `failed` and `aborted` statuses in the status filter of the page, or of the room's console Recordings tab
- **THEN** the recordings in either status are listed

#### Scenario: Access without the permission

- **WHEN** a visitor whose access to the room lacks `recordingList` opens the page
- **THEN** an error page is shown instead of the list

#### Scenario: Listing without playing

- **GIVEN** a room member whose permissions hold `recordingList` but not `recordingPlay`
- **WHEN** the member opens the room recordings page
- **THEN** the page lists the room's recordings with play and share disabled, and their tooltip names `recordingPlay`

## ADDED Requirements

### Requirement: Console recordings figures

The console Recordings page SHALL show, as the key figures of a console list (see `console`), the
recordings the user can list in total, in progress (`starting`, `active` or `ending`), `complete`, and
failed (`failed`, `aborted` or `limit_reached`), each of the last three filtering the list by its
statuses. The Recordings tab of a room's detail page SHALL show no figures.

#### Scenario: Administrator

- **GIVEN** 48 recordings, one `active`, 45 `complete`, one `failed` and one `aborted`
- **WHEN** an admin opens the Recordings page
- **THEN** the figures show 48 recordings, 1 in progress, 45 complete and 2 failed

#### Scenario: Failed figure filters by its statuses

- **WHEN** the user selects the failed figure on the Recordings page
- **THEN** the list shows the `failed`, `aborted` and `limit_reached` recordings
- **AND** the status filter of the page holds those three statuses

### Requirement: Recordings summary endpoint

`recordingGetSummary` (`GET /internal-api/v1/recordings/summary`) SHALL count the recordings
`recordingList` lists for the caller (see "Recording list scope"), and SHALL answer an access token
of a user of any role and `401` to an API key, a room member token or no credential.

#### Scenario: Member counts only what they can list

- **GIVEN** a `room_member` user who is a member of room A with `recordingList`, two `complete` recordings in room A and three in a room B the user has no access to
- **WHEN** the user calls `recordingGetSummary`
- **THEN** it reports 2 recordings, 2 of them complete

#### Scenario: Room member token is not accepted

- **WHEN** a client calls `recordingGetSummary` with a room member token
- **THEN** the server answers `401`

#### Scenario: API key is not accepted

- **WHEN** a client calls `recordingGetSummary` with the API key
- **THEN** the server answers `401`

#### Scenario: No credential

- **WHEN** a client calls `recordingGetSummary` without credentials
- **THEN** the server answers `401`
