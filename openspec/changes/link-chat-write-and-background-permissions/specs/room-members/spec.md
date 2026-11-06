## MODIFIED Requirements

### Requirement: Console permission toggles
The member form SHALL group the permission toggles under Meeting, Media, Recordings, Live broadcast and Chat, start them at the values of the chosen base role, reset them to the new role's values when the role changes, and send as `customPermissions` only the toggles that differ from the role, an empty object when an edited member no longer differs. It SHALL disable the `chatWrite`, `mediaChangeVirtualBackground` and `broadcastEdit` toggles while `chatRead`, `mediaPublishVideo` and `broadcastControl` respectively are off, keeping their values.

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
