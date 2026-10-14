## MODIFIED Requirements

### Requirement: Room recordings page
The page `/room/{roomId}/recordings` SHALL list the room's recordings to a visitor whose access to the
room (an access link secret, a room member or a registered user) holds `recordingList`, offering play
and share only with `recordingPlay`, download only with `recordingDownload` and delete only with
`recordingDelete`. Without `recordingList` it SHALL show an error page. The room's anonymous
recording link (see `room-access`) grants list, play and download.

#### Scenario: Anonymous recording link
- **GIVEN** a room with recordings and anonymous recording access enabled
- **WHEN** a visitor opens the room's anonymous recording link
- **THEN** the page lists the room's recordings with play and download but no delete

#### Scenario: Access without the permission
- **WHEN** a visitor whose access to the room lacks `recordingList` opens the page
- **THEN** an error page is shown instead of the list

#### Scenario: Listing without playing
- **GIVEN** a room member whose permissions hold `recordingList` but not `recordingPlay`
- **WHEN** the member opens the room recordings page
- **THEN** the page lists the room's recordings without play nor share actions

### Requirement: Console recordings page
The console's Recordings page, available to `admin`, `room_manager` and `room_member` users, SHALL
list the recordings `getRecordings` returns to the user, searchable by room name with the same match
modes, filterable by status and sortable. Like a room's Recordings tab, it SHALL offer play and share
(`recordingPlay`), download and ZIP download (`recordingDownload`), and delete and bulk delete
(`recordingDelete`) only for recordings whose room grants the user that permission.

#### Scenario: Admin
- **WHEN** an `admin` user opens the Recordings page
- **THEN** every recording is listed, with download offered for every complete one and delete for every finished one

#### Scenario: Member without delete permission
- **GIVEN** a `room_member` user holding `recordingList` but not `recordingDelete` in room A
- **WHEN** the user opens the Recordings page
- **THEN** the recordings of room A are listed without a delete action

#### Scenario: Member without play permission
- **GIVEN** a `room_member` user holding `recordingList` but not `recordingPlay` in room A
- **WHEN** the user opens the Recordings page, or the Recordings tab of room A's detail page
- **THEN** the recordings of room A are listed without play nor share actions
