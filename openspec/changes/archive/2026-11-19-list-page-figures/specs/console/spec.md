## ADDED Requirements

### Requirement: Console lists show their key figures

The console Rooms, Recordings and Users pages SHALL show, between the page title and the list, the key figures of that page (see `rooms`, `recordings` and `users`), counted over every item the user can see on the page whatever the search text and the other filters of the list. The figures SHALL be read again whenever the list is: when the page opens, on Refresh and after an action that changes the list.

#### Scenario: Searching does not change the figures

- **GIVEN** the Rooms page showing 24 rooms
- **WHEN** the user searches for a name that matches 2 rooms
- **THEN** the list shows 2 rooms and the figures still count 24

#### Scenario: Figures follow an action on the list

- **GIVEN** the Rooms page with 6 closed rooms
- **WHEN** the user deletes one closed room from the list
- **THEN** the closed figure shows 5

### Requirement: Console list figures filter the list

A figure that filters SHALL apply its filter to the list when selected, appear selected while the list's filter is exactly its own, and clear that filter when selected again; the "all" figure SHALL clear it. The filter a figure applies SHALL be the page's own filter, kept in the URL and shown in the filter panel like any other.

#### Scenario: Selecting a figure filters the list

- **GIVEN** an admin on the Rooms page with 3 rooms in a meeting among 24
- **WHEN** they select the "in a meeting now" figure
- **THEN** the list shows only rooms in a meeting and the figure appears selected
- **AND** the URL and the filter panel carry the status filter

#### Scenario: Selecting it again clears the filter

- **GIVEN** the Rooms page filtered by the "in a meeting now" figure
- **WHEN** the user selects that figure again
- **THEN** the list shows every room and the "all rooms" figure appears selected

#### Scenario: Filter chosen in the panel

- **GIVEN** the Rooms page
- **WHEN** the user filters by the `closed` status in the filter panel
- **THEN** the closed figure appears selected

### Requirement: Console list figures follow the screen width

From 1200 px wide the figures SHALL show as tiles in one row, from 768 px as compact tiles in one row, and below 768 px as one card holding the total, a bar split by figure and a chip per figure that filters as its tile does.

#### Scenario: Phone width

- **GIVEN** a screen 390 px wide
- **WHEN** the user opens the Recordings page
- **THEN** the figures show as one card with the total, a bar and a chip per figure
- **AND** selecting the failed chip filters the list as the failed tile does

#### Scenario: Tablet width

- **GIVEN** a screen 834 px wide
- **WHEN** the user opens the Rooms page
- **THEN** the five figures show as compact tiles in one row

### Requirement: Console list figures never block the list

When there is no item to count, or the figures cannot be read, the page SHALL show no figure and the list SHALL work as before.

#### Scenario: Nothing to count

- **GIVEN** a deployment without rooms
- **WHEN** an admin opens the Rooms page
- **THEN** no figure is shown and the list shows its empty state

#### Scenario: Figures cannot be read

- **GIVEN** a server that fails the request for the figures of the Recordings page
- **WHEN** the user opens the page
- **THEN** no figure is shown and the list of recordings loads as usual
