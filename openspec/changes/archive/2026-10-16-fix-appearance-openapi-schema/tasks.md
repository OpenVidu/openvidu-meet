# Tasks

## 1. Appearance OpenAPI

- [x] 1.1 In `meet-ce/backend/openapi/config/schemas/rooms-appearance-config.yaml`, set the five color patterns to `^#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})$` with descriptions naming `#RGB`, `#RGBA`, `#RRGGBB` and `#RRGGBBAA` and saying an omitted color keeps its stored value; add `pattern: '^[a-zA-Z0-9_-]+$'` to `name` with a valid example (`corporate-dark`); remove `minItems: 1` from `themes` and say it is empty until a theme is saved. Verify the patterns match the server's Zod schema in `src/models/zod-schemas/room.schema.ts` character for character.
- [x] 1.2 State in `config/requests/update-appearance-config.yaml` that `themes` must hold exactly one theme, and in the `updateRoomsAppearanceConfig` description of `config/config.yaml` that the stored theme is replaced and omitted colors keep their value; verify against `tests/integration/api/global-config/appearance.test.ts`.
- [x] 1.3 Run `pnpm run lint:api` in `meet-ce/backend` and verify Redocly reports no new problem. Redocly lint: both APIs valid, no new problem.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. The change corrects the OpenAPI to describe behavior the server already had (root `CLAUDE.md`, Changelog).
- [x] 2.2 openvidu.io: none. The internal REST API reference is not published there.
