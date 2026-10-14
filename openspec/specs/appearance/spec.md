# Appearance Specification

## Purpose

The rooms appearance configuration holds one custom theme, a light or dark base and five colors, that applies to the meetings of every room of the deployment, so a deployment can carry its organization's brand. Admins set it from the console; participants see it on the join screen and in the meeting, on every embedding mode.

Surfaces: internal REST API `getRoomsAppearanceConfig` and `updateRoomsAppearanceConfig` (`/internal-api/v1/config/rooms/appearance`, `meet-ce/backend/openapi/config/`), the console Configuration page, the join screen and the meeting. Documented in openvidu.io `docs/meet/features/rooms/management.md` (Room Appearance).

## Requirements

### Requirement: One deployment-wide theme
Meet SHALL hold one appearance configuration for the whole deployment, applied to the meetings of every room. It SHALL not be part of a room's `config` (see `room-config`) and SHALL not be exposed through the public REST API.

#### Scenario: Every room shares the theme
- **GIVEN** an enabled custom theme with a dark base
- **WHEN** participants open meetings in two different rooms
- **THEN** both meetings use the dark base and the theme's colors

### Requirement: No theme by default
A deployment SHALL start with no custom theme: `getRoomsAppearanceConfig` SHALL return `{ "appearance": { "themes": [] } }` until an admin saves one, and meetings SHALL use Meet's default look.

#### Scenario: Fresh deployment
- **GIVEN** a deployment where no theme was ever saved
- **WHEN** a client calls `getRoomsAppearanceConfig`
- **THEN** the server answers `200` with an empty `themes` list

### Requirement: Reading the configuration needs no credential
`getRoomsAppearanceConfig` (`GET /internal-api/v1/config/rooms/appearance`) SHALL answer any caller without a credential, because the join screen reads it before any session exists.

#### Scenario: Anonymous read
- **WHEN** a browser without any token calls `getRoomsAppearanceConfig`
- **THEN** the server answers `200` with the stored configuration

### Requirement: Only admins update the configuration
`updateRoomsAppearanceConfig` (`PUT /internal-api/v1/config/rooms/appearance`) SHALL accept only an access token of a user with role `admin`. A user with another role SHALL get `403`; the API key or no credential SHALL get `401`.

#### Scenario: Admin updates the theme
- **WHEN** an admin calls `updateRoomsAppearanceConfig` with a valid theme
- **THEN** the server answers `200` with the stored configuration

#### Scenario: Room manager is refused
- **WHEN** a `room_manager` calls `updateRoomsAppearanceConfig`
- **THEN** the server answers `403`

#### Scenario: API key is not accepted
- **WHEN** a client calls `updateRoomsAppearanceConfig` with the API key
- **THEN** the server answers `401`

### Requirement: Exactly one theme
`updateRoomsAppearanceConfig` SHALL require `appearance.themes` to hold exactly one theme and SHALL answer `422` to an empty list, to more than one theme, or to an `appearance` or `themes` of the wrong type.

#### Scenario: Two themes
- **WHEN** an admin sends two themes
- **THEN** the server answers `422` and the stored configuration is unchanged

#### Scenario: Empty list
- **WHEN** an admin sends `{ "appearance": { "themes": [] } }`
- **THEN** the server answers `422`

### Requirement: Theme validation
A theme SHALL have a `name` of 1 to 50 letters, digits, hyphens or underscores, a boolean `enabled` and a `baseTheme` of `light` or `dark`; each of `backgroundColor`, `primaryColor`, `secondaryColor`, `accentColor` and `surfaceColor` is optional and SHALL be a hex color `#RGB`, `#RGBA`, `#RRGGBB` or `#RRGGBBAA`. Any violation SHALL get `422`; a malformed JSON body SHALL get `400`.

#### Scenario: Name with a space
- **WHEN** an admin sends a theme named `my theme`
- **THEN** the server answers `422`

#### Scenario: Color with alpha
- **WHEN** an admin sends `primaryColor` `#1976d2cc`
- **THEN** the server stores it and answers `200`

#### Scenario: Invalid color
- **WHEN** an admin sends `backgroundColor` `red`
- **THEN** the server answers `422`

#### Scenario: Missing base theme
- **WHEN** an admin sends a theme without `baseTheme`
- **THEN** the server answers `422`

### Requirement: Update replaces the theme and keeps omitted colors
`updateRoomsAppearanceConfig` SHALL replace the stored theme's `name`, `enabled` and `baseTheme`, and each color the request omits SHALL keep the value of the stored theme. The response and later reads SHALL return the resulting configuration.

#### Scenario: Omitted color kept
- **GIVEN** a stored theme with `backgroundColor` `#ffffff` and `primaryColor` `#1976d2`
- **WHEN** an admin updates it with a dark base and only `primaryColor` `#bb86fc`
- **THEN** `getRoomsAppearanceConfig` returns the dark base, `primaryColor` `#bb86fc` and `backgroundColor` `#ffffff`

### Requirement: Enabled theme styles the meeting
While the stored theme is `enabled`, the join screen and the meeting SHALL use its base theme and its colors: `backgroundColor` for the meeting background, `primaryColor` for the main controls, `secondaryColor` for logos, icons and borders, `accentColor` for active and highlighted items, and `surfaceColor` for panels and dialogs. A color the theme does not set SHALL keep the base theme's default.

#### Scenario: Branded meeting
- **GIVEN** an enabled theme with a light base and `primaryColor` `#e30613`
- **WHEN** a participant opens a meeting
- **THEN** the join screen and the meeting are light with red main controls

#### Scenario: Embedded meeting
- **GIVEN** an enabled theme
- **WHEN** a host application embeds a meeting with the webcomponent or an iframe
- **THEN** the embedded meeting uses the theme

### Requirement: Theme overrides the participant's preference
While the stored theme is `enabled`, the meeting SHALL use its base theme over the participant's own light or dark preference, SHALL hide the meeting's theme selector, and SHALL leave the participant's stored preference unchanged.

#### Scenario: Participant prefers dark
- **GIVEN** a participant whose stored preference is dark
- **AND** an enabled theme with a light base
- **WHEN** they open a meeting
- **THEN** the meeting is light and offers no theme selector
- **AND** their stored preference is still dark

### Requirement: Disabled theme leaves the default look
While no theme is stored or the stored theme is not `enabled`, the meeting SHALL use the participant's light or dark preference with Meet's default colors and SHALL offer its theme selector. A disabled theme SHALL stay stored, so enabling it again restores its colors.

#### Scenario: Theme switched off
- **GIVEN** a stored theme with `enabled` `false`
- **WHEN** a participant opens a meeting
- **THEN** the meeting uses their own theme preference and the default colors
- **AND** the settings offer the theme selector

### Requirement: Theme applied when the meeting loads
The meeting SHALL read the appearance configuration when the participant's page loads. A participant who opens a meeting after a change SHALL see it; a participant already in a meeting SHALL keep the previous look until the page is reloaded.

#### Scenario: Change during a meeting
- **GIVEN** a participant in a meeting
- **WHEN** an admin enables a new theme
- **THEN** the participant's meeting keeps its previous look
- **AND** a participant joining afterwards sees the new theme

### Requirement: Console configuration page
The console Configuration page, reachable by users with role `admin` only (see `console`), SHALL show the stored theme with a switch to use a custom design. While the switch is on it SHALL show a light or dark base selector and one color picker per color (meeting background, main controls, secondary elements, highlights and accents, panels and dialogs), each showing the base theme's default until the admin picks a color.

#### Scenario: Nothing stored yet
- **GIVEN** a deployment with no stored theme
- **WHEN** an admin opens the Configuration page
- **THEN** the custom design switch is off
- **AND** turning it on shows the light base with the default light colors

### Requirement: Saving from the console stores a complete theme
Saving from the Configuration page SHALL store one theme named `default` with the chosen base theme, the switch state and all five colors, filling every color the admin did not pick with the base theme's default, and SHALL confirm the save or report its failure. The save action SHALL stay disabled until the form differs from the stored theme.

#### Scenario: Only one color picked
- **GIVEN** an admin turns the custom design on, keeps the light base and picks only the main controls color
- **WHEN** they save
- **THEN** the stored theme is `default`, enabled, with the picked main controls color and the light defaults for the other four colors
- **AND** a confirmation is shown

### Requirement: Turning the custom design off saves at once
Turning off the switch of a stored enabled theme SHALL save immediately the stored theme with `enabled` `false`, discarding unsaved edits, without pressing save.

#### Scenario: Admin switches the theme off
- **GIVEN** a stored enabled theme
- **WHEN** an admin turns the custom design switch off
- **THEN** the stored theme becomes disabled with its colors kept

### Requirement: Changing the base theme in the console
Changing the base theme on the Configuration page SHALL replace each color still equal to the previous base's default with the new base's default, and SHALL keep every color the admin customized.

#### Scenario: From light to dark
- **GIVEN** a form with a light base, a custom main controls color and the other colors at their light defaults
- **WHEN** the admin selects the dark base
- **THEN** the main controls color is kept and the other four colors switch to the dark defaults

### Requirement: Resetting colors in the console
The Configuration page SHALL offer to reset the colors, which SHALL restore the colors of the stored theme, and SHALL keep that action disabled while no color differs from them.

#### Scenario: Undo unsaved color edits
- **GIVEN** an admin changed two colors without saving
- **WHEN** they press reset colors
- **THEN** both colors return to the stored values and the reset action becomes disabled
