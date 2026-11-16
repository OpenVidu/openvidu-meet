## MODIFIED Requirements

### Requirement: No theme by default
A deployment SHALL start with no custom theme: `configGetRoomsAppearance` SHALL return `{ "appearance": { "themes": [] } }` until an admin saves one, and meetings SHALL use Meet's default look.

#### Scenario: Fresh deployment
- **GIVEN** a deployment where no theme was ever saved
- **WHEN** a client calls `configGetRoomsAppearance`
- **THEN** the server answers `200` with an empty `themes` list

### Requirement: Reading the configuration needs no credential
`configGetRoomsAppearance` (`GET /internal-api/v1/config/rooms/appearance`) SHALL answer any caller without a credential, because the join screen reads it before any session exists.

#### Scenario: Anonymous read
- **WHEN** a browser without any token calls `configGetRoomsAppearance`
- **THEN** the server answers `200` with the stored configuration

### Requirement: Only admins update the configuration
`configUpdateRoomsAppearance` (`PUT /internal-api/v1/config/rooms/appearance`) SHALL accept only an access token of a user with role `admin`. A user with another role SHALL get `403`; the API key or no credential SHALL get `401`.

#### Scenario: Admin updates the theme
- **WHEN** an admin calls `configUpdateRoomsAppearance` with a valid theme
- **THEN** the server answers `200` with the stored configuration

#### Scenario: Room manager is refused
- **WHEN** a `room_manager` calls `configUpdateRoomsAppearance`
- **THEN** the server answers `403`

#### Scenario: API key is not accepted
- **WHEN** a client calls `configUpdateRoomsAppearance` with the API key
- **THEN** the server answers `401`

### Requirement: Exactly one theme
`configUpdateRoomsAppearance` SHALL require `appearance.themes` to hold exactly one theme and SHALL answer `422` to an empty list, to more than one theme, or to an `appearance` or `themes` of the wrong type.

#### Scenario: Two themes
- **WHEN** an admin sends two themes
- **THEN** the server answers `422` and the stored configuration is unchanged

#### Scenario: Empty list
- **WHEN** an admin sends `{ "appearance": { "themes": [] } }`
- **THEN** the server answers `422`

### Requirement: Update replaces the theme and keeps omitted colors
`configUpdateRoomsAppearance` SHALL replace the stored theme's `name`, `enabled` and `baseTheme`, and each color the request omits SHALL keep the value of the stored theme. The response and later reads SHALL return the resulting configuration.

#### Scenario: Omitted color kept
- **GIVEN** a stored theme with `backgroundColor` `#ffffff` and `primaryColor` `#1976d2`
- **WHEN** an admin updates it with a dark base and only `primaryColor` `#bb86fc`
- **THEN** `configGetRoomsAppearance` returns the dark base, `primaryColor` `#bb86fc` and `backgroundColor` `#ffffff`
