## ADDED Requirements

### Requirement: Console lists keep their rows while they reload
A console list that reloads, because of a search, a sort, a refresh or loading more rows, SHALL keep the rows it shows, dimmed and not clickable, until the new rows arrive, and SHALL show placeholder rows instead of a spinner when it has no rows to keep.

#### Scenario: Searching keeps the rows on screen
- **GIVEN** a console list showing rooms
- **WHEN** the user changes a filter and the server takes a while to answer
- **THEN** the rooms stay on screen, dimmed, until the new list replaces them

#### Scenario: First rows of a list
- **GIVEN** a console list with no rows, after a search found nothing
- **WHEN** the user clears the search and the server takes a while to answer
- **THEN** placeholder rows are shown until the rooms arrive
