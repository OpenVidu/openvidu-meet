# Proposal

## Why

The OpenAPI of the rooms appearance configuration (`meet-ce/backend/openapi/config/`) disagrees with what the server does and with the `appearance` spec: it rejects colors with alpha that the server accepts, allows theme names with spaces that the server rejects (its own example `Default Theme` is invalid), declares `minItems: 1` although a fresh deployment returns an empty `themes` list, and does not say that an update keeps the colors it omits. A reader building against the reference gets a wrong contract.

## What Changes

- `MeetRoomTheme` colors (`backgroundColor`, `primaryColor`, `secondaryColor`, `accentColor`, `surfaceColor`): the pattern also accepts `#RGBA` and `#RRGGBBAA`, and each description says an omitted color keeps its stored value on update, so a color cannot be removed once set.
- `MeetRoomTheme.name`: the pattern of letters, digits, hyphens and underscores is declared, and the example becomes a valid name.
- `MeetAppearanceConfig.themes`: no minimum, so the empty list `getRoomsAppearanceConfig` returns until a theme is saved is valid; the `updateRoomsAppearanceConfig` request states that it needs exactly one theme.
- `updateRoomsAppearanceConfig` description: the stored theme is replaced and omitted colors keep their value.

Documentation only: no behavior changes and no changelog line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `appearance` spec already states this behavior (requirements "No theme by default", "Exactly one theme", "Theme validation" and "Update replaces the theme and keeps omitted colors"); the OpenAPI is brought in line with it.

## Impact

- Surfaces: the internal REST API reference only (`/internal-api/v1/config/rooms/appearance`, served at `<base path>/internal-api/v1/docs` in development). The wire contract does not change.
- Files: `meet-ce/backend/openapi/config/schemas/rooms-appearance-config.yaml`, `config/requests/update-appearance-config.yaml`, `config/config.yaml`.
- openvidu.io: none. The internal API is not published.
