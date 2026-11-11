## MODIFIED Requirements

### Requirement: Console permission toggles
The member form SHALL group permission toggles under Meeting, Media, Recordings, Live broadcast, Chat and Waiting room, start them at the base role's values, reset them on a role change, and send as `customPermissions` only the toggles that differ from the role, an empty object for an edited member matching it. It SHALL disable `chatWrite`, `mediaChangeVirtualBackground` and `broadcastEdit` while `chatRead`, `mediaPublishVideo` and `broadcastControl` respectively are off, keeping their values.

#### Scenario: Only differences are sent
- **GIVEN** the add member form with base role `speaker`
- **WHEN** the owner switches on `recordingControl` and saves
- **THEN** the member is added with `customPermissions` holding only `recordingControl`

#### Scenario: Overrides removed on edit
- **GIVEN** a member with overrides being edited
- **WHEN** the owner sets every toggle back to the role's value and saves
- **THEN** the member is updated with an empty `customPermissions` object

#### Scenario: Dependent toggle follows the one it needs
- **GIVEN** the add member form with base role `speaker`, whose role denies `broadcastControl` and `broadcastEdit`
- **WHEN** the owner switches on `broadcastControl`
- **THEN** the `broadcastEdit` toggle becomes available
- **AND** switching `broadcastControl` off again disables it, keeping its value

#### Scenario: Dependent value kept when the base role changes
- **GIVEN** the add member form with base role `moderator`
- **WHEN** the owner switches the base role to `speaker`, whose role denies `chatRead` and grants `chatWrite`
- **THEN** the `chatWrite` toggle is disabled and on, and the member is added with the speaker role's `chatWrite`

#### Scenario: Waiting room group
- **GIVEN** the add member form with base role `moderator`
- **WHEN** the owner opens the permission toggles
- **THEN** a Waiting room group holds the `waitingRoomBypass` and `waitingRoomAdmin` toggles, both on
