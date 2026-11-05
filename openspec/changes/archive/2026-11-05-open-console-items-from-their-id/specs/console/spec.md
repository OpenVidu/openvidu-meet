## ADDED Requirements

### Requirement: Console lists open an item from its id
On the console lists of rooms, recordings and users, a row SHALL NOT open anything when clicked. The id of the room, the recording or the user SHALL be a link to its detail page, which opens in the same tab on click and in a new tab with the browser's own controls. On the Users list, the id of the signed-in user SHALL open their profile.

#### Scenario: Clicking a row does nothing
- **GIVEN** a console list of rooms
- **WHEN** the user clicks a row outside its id and its controls
- **THEN** the list stays as it is

#### Scenario: Opening an item from its id
- **GIVEN** a console list of recordings
- **WHEN** the user clicks the id of a recording
- **THEN** the recording detail page opens in the same tab
- **AND** the same link opened in a new tab shows the same page
