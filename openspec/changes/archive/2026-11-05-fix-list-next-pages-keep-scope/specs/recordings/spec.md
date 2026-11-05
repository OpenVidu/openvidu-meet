## MODIFIED Requirements

### Requirement: Recording list filtering, sorting and pagination
`getRecordings` SHALL filter by `roomId` (which wins over `roomName`), by `roomName` (exact by
default, or prefix, partial or regex match, optionally case-insensitive) and by `status`; SHALL sort
by `startDate` (default, newest first), `roomName`, `duration` or `size`; and SHALL paginate with
`maxItems` (default `10`, values above `100` served as `100`) and `nextPageToken`. Every page SHALL
apply the same filters and the same list scope as the first, whatever `fields` holds.

#### Scenario: Default order
- **WHEN** `getRecordings` is called without sort parameters
- **THEN** the recordings come newest `startDate` first, at most 10 per page

#### Scenario: Oversized page
- **WHEN** `getRecordings` is called with `maxItems` set to `500`
- **THEN** the page holds at most 100 recordings and reports `maxItems` as `100`

#### Scenario: Later pages keep the caller's scope
- **GIVEN** a `room_member` user whose membership of room A holds `recordingList`, two recordings in room A, and an older recording in a room B the user has no access to
- **WHEN** the user pages through `getRecordings` with `maxItems=1`
- **THEN** the pages together hold the two recordings of room A only

#### Scenario: Paging with a field selection
- **GIVEN** two recordings
- **WHEN** `getRecordings` is called with `fields=recordingId` and `maxItems=1` and then with the returned `nextPageToken`
- **THEN** the second page holds the other recording, carrying only `recordingId`

#### Scenario: Invalid parameters
- **WHEN** `getRecordings` is called with `maxItems` set to `0`, an unknown `status`, or an invalid regular expression in regex mode
- **THEN** the REST API answers `422`

#### Scenario: Invalid page token
- **WHEN** `getRecordings` is called with a `nextPageToken` the server did not issue
- **THEN** the REST API answers `400`
