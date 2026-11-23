# Spec Delta

## MODIFIED Requirements

### Requirement: Access check before the join screen

Before showing the join screen, the meeting SHALL check access to the room with the link's secret, the signed-in user, or both, without joining the meeting, and SHALL show an access error screen when the check fails: "Invalid link" for an unknown secret, "Anonymous access disabled" when the link's role has anonymous access turned off, "Invalid member" for the link of an identified guest that no longer grants access, because the guest was removed or their link regenerated, saying that the person who invited them can give them a new one, "Invalid room" for a missing room, "Forbidden room access" when refused, "Too many requests" when rate limited.

#### Scenario: Unknown secret

- **GIVEN** a room URL whose `secret` matches none of the room's access secrets
- **WHEN** a person opens it
- **THEN** the "Invalid link" error screen is shown and no join screen

#### Scenario: Anonymous access disabled for the role

- **GIVEN** a room whose anonymous speaker access is disabled
- **WHEN** a person opens its speaker link
- **THEN** the "Anonymous access disabled" error screen is shown

#### Scenario: Removed identified guest

- **GIVEN** the personal link of an identified guest who was removed from the room
- **WHEN** they open it
- **THEN** the "Invalid member" error screen is shown

#### Scenario: Regenerated guest link

- **GIVEN** the previous link of an identified guest whose link was regenerated
- **WHEN** they open it
- **THEN** the "Invalid member" error screen says that the link is no longer valid and that the person who invited them can give them a new one

#### Scenario: Deleted room

- **GIVEN** a link to a room that no longer exists
- **WHEN** a person opens it
- **THEN** the "Invalid room" error screen is shown

#### Scenario: Signed-in user without access

- **GIVEN** a signed-in user who is not a member of a room whose user access is disabled
- **WHEN** they open the room's user access link
- **THEN** the "Forbidden room access" error screen is shown
