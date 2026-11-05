## MODIFIED Requirements

### Requirement: Listing members
`getRoomMembers` SHALL return a page of the room's members filtered by `name` (match mode `exact` by default, or `prefix`, `partial` or `regex`, case-sensitive unless `nameCaseInsensitive` is `true`), `baseRole` and `type`, sorted by `membershipDate` (the default) or `name`, in descending order unless `sortOrder` says otherwise, with `maxItems` defaulting to 10 and capped at 100. Every page SHALL apply the same filters as the first, whatever `fields` holds.

#### Scenario: Default order
- **GIVEN** a room with members added one after another
- **WHEN** a manager calls `getRoomMembers` with no parameters
- **THEN** the server returns up to 10 members, the most recently added first

#### Scenario: Next page
- **GIVEN** a room with 15 members
- **WHEN** a manager calls `getRoomMembers` with `maxItems=10` and then with the returned `nextPageToken`
- **THEN** the first page holds 10 members and reports `isTruncated` true, and the second holds the other 5

#### Scenario: Next page with a field selection
- **GIVEN** a room with 5 members
- **WHEN** a manager pages through `getRoomMembers` with `fields=memberId` and `maxItems=2`
- **THEN** the pages together hold the 5 members, each carrying only `memberId`

#### Scenario: Oversized page
- **WHEN** a manager calls `getRoomMembers` with `maxItems=500`
- **THEN** the page holds at most 100 members

#### Scenario: Filter by type
- **WHEN** a manager calls `getRoomMembers` with `type=identified_guest`
- **THEN** only identified guests are returned

#### Scenario: Invalid query
- **WHEN** `maxItems` is zero or negative, `nameMatchMode` or `sortField` is unknown, or `name` is an invalid regular expression with `nameMatchMode=regex`
- **THEN** the server answers `422`

#### Scenario: Invalid page token
- **WHEN** a manager passes a `nextPageToken` the server did not issue
- **THEN** the server answers `400`
