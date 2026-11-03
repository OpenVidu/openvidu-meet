## ADDED Requirements

### Requirement: A member update keeps what the link gave them
When the permissions of a member who joined with a secret change during the meeting, the permissions applied to their live participant SHALL still include those the secret's role grants, merged with the member's new permissions, and their badge SHALL stay that of the merged permissions.

#### Scenario: Unrelated update of a member on the moderator link
- **GIVEN** a user member with `baseRole` `speaker` in the meeting through the room's anonymous moderator link
- **WHEN** a manager turns off their `recordingDownload`
- **THEN** they keep the moderator badge and the permissions the link grants, such as `participantKick`
- **AND** a media source the link allows stays published

#### Scenario: Update with a client that ignores renewals
- **GIVEN** the same participant with a client that never renews its token
- **WHEN** a manager updates their permissions
- **THEN** the live permissions still include those of the moderator role
