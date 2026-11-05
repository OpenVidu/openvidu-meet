## ADDED Requirements

### Requirement: Room list pages keep the query
Every page of `getRooms` SHALL apply the filters and the access scope of the first page, and SHALL continue the listing whatever `fields` holds.

#### Scenario: Later pages keep the caller's scope
- **GIVEN** a `room_member` user who is a member of room A, a room B open to registered users, and rooms C and D they have no access to
- **WHEN** the user pages through `getRooms` with `maxItems=1`
- **THEN** the pages together hold rooms A and B only

#### Scenario: Paging with a field selection
- **GIVEN** three rooms exist
- **WHEN** `getRooms` is called with `fields=roomId` and `maxItems=2` and then with the returned `nextPageToken`
- **THEN** the second page holds the remaining room
- **AND** every room in both pages carries only `roomId`
