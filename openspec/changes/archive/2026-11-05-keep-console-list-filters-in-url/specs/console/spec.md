## ADDED Requirements

### Requirement: Console lists keep their search and filters in the URL
On the console lists of rooms, users and recordings, the search text, its match mode, the filters and the sort field and order SHALL be kept in the URL query string, so that opening, reloading or sharing the URL shows the same list and the browser's back and forward buttons step through the searches. A value the list does not accept SHALL be ignored, and a list opened without a query string SHALL show the default list.

#### Scenario: Searching changes the URL
- **GIVEN** the console Rooms list
- **WHEN** the user filters by status and sorts by name
- **THEN** the URL carries the status and the sort
- **AND** reloading the page shows the same filtered, sorted list

#### Scenario: Going back after opening an item
- **GIVEN** a filtered list of recordings
- **WHEN** the user opens a recording and then goes back
- **THEN** the list is filtered as before and shows the current data

#### Scenario: Unknown value in the URL
- **GIVEN** a URL of the Users list with a sort field the list does not offer
- **WHEN** the page opens
- **THEN** the list is sorted by its default field

### Requirement: Room detail keeps its tab in the URL
The console room detail page SHALL keep the selected tab (recordings or room members) in the URL query string, so that a reload or a return from another page opens the same tab.

#### Scenario: Returning to the members tab
- **GIVEN** a room manager on the Room Members tab of a room
- **WHEN** they open a member's edit page and go back
- **THEN** the Room Members tab is selected
