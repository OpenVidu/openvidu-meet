## ADDED Requirements

### Requirement: Console notices follow the language
Every notice and dialog the console raises about the outcome of a room deletion, whether the room was deleted, closed instead of deleted or could not be deleted, SHALL be shown in the selected language and not in the server's message.

#### Scenario: Room deleted in Spanish
- **GIVEN** the console in Spanish
- **WHEN** a user deletes a room from its detail page and confirms
- **THEN** the notice that the room was deleted is in Spanish

#### Scenario: Room closed instead of deleted
- **GIVEN** the console in French and a room with recordings
- **WHEN** the user chooses to close the room instead of deleting it
- **THEN** the notice that the room was closed is in French
