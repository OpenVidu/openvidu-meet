# Typings (`@openvidu-meet/typings`)

The contract package: every type shared between the backend, the frontend/library, the webcomponent
and third-party host applications. It has **no runtime dependencies** (only TypeScript as a devDep)
and it must stay that way — anything that needs a dependency belongs in the consuming package.

`src/` is the only editable place. `dist/` is generated (`tsc -p tsconfig.build.json`) and git-ignored.

## Why it must be built first

This package is **not types-only**: it exports `enum`s (`MeetUserRole`, `MeetRoomMemberRole`,
`EmbeddedAttribute`, `MeetWebhookEventType`, …) that consumers import as *values*. `dist/index.js`
therefore has to exist before the backend or frontend compiles or runs. `./meet.sh build-typings`
(or `pnpm --filter @openvidu-meet/typings run build`) is step 0 of every build.

In dev, `./meet.sh dev` runs `tsc --watch` here and writes `dist/typings-ready.flag`; the other
watchers block on that flag, so a type error in this package stalls them by design — check this
watcher's output first when the backend/frontend watcher looks stuck.

Backend Jest and webcomponent Jest map `@openvidu-meet/typings` to `src/index.ts` directly, so unit
tests work without a build. Real builds do not.

## Layout

| Path | Contents |
| ---- | -------- |
| `src/database/` | Persisted domain entities and their enums: `user.entity`, `room.entity`, `room-member.entity`, `recording.entity`, `api-key.entity`, `global-config.entity`, plus `room-config` and `room-member-permissions` |
| `src/request/` | REST request bodies / query options (`room-request`, `room-member-request`, `user-request`) |
| `src/response/` | REST response shapes and the generic query helpers: `field-projection`, `sort-pagination`, `extra-field`, `text-match`, per-entity `*-response` |
| `src/embedded/` | The **public embedding API**: `attributes.ts`, `commands.ts`, `events.ts` |
| `src/webhook.ts` | Outgoing webhook event types and payloads |
| `src/frontend-signal.ts` | Real-time signals pushed to clients over the LiveKit data channel (`MeetSignalType`) |
| `src/livekit-permissions.ts` | Mirrored LiveKit enums (e.g. `TrackSource`) so consumers don't need the LiveKit SDK for types |
| `src/analytics.ts`, `src/ai-assistant.ts` | Analytics and AI-assistant contracts |

`src/index.ts` is the single barrel — a new file is invisible until it is re-exported there (directly
or through the folder's `index.ts`).

## Conventions

- **Relative imports need the `.js` extension** (`export * from './webhook.js'`), matching the ESM
  output consumed by the backend.
- Names are prefixed `Meet*` for domain types (`MeetRoom`, `MeetUser`, `MeetRoomMemberPermissions`)
  and `Embedded*` for the embedding API (`EmbeddedAttribute`, `EmbeddedCommandName`,
  `EmbeddedEventName`).
- **Every exported member gets a TSDoc comment.** This is not decoration:
  - `scripts/generate-webcomponent-docs.js` parses the JSDoc of the enums in `src/embedded/` to
    generate `docs/webcomponent/{attributes,commands,events}.md`. It reads the raw text, so keep the
    `/** … */` block directly above each enum member and keep one member per line. Tags like
    `@required`, `@moderator`, `@prejoin` and `@category` are meaningful to that generator, and so is
    **`@deprecated`**: a member carrying it is **excluded** from the generated tables (like `@private`),
    so the public docs only ever show canonical names. The generator prints what it excluded.
  - `{@link Other}` references are used throughout; keep them valid when renaming.
- Domain entity types describe the **API/domain shape**, not the persistence shape. Mongo-only fields
  (`_id`, `schemaVersion`) stay in the backend's document types and are stripped before responses.
- Payload maps use the "enum key → payload" pattern (`EmbeddedCommandPayloads`,
  `EmbeddedEventPayloads`) with a `…PayloadFor<T>` helper. Add a new command/event by extending the
  enum *and* its payload map so consumers stay type-safe.
- **Renaming** a public identifier is never a rename in place: add the new name as canonical, keep the
  old one as a `@deprecated` alias whose text states the removal release (`Removed in 3.12.0.`), and
  register the pair in the alias map next to the enum (`EMBEDDED_COMMAND_ALIASES`,
  `EMBEDDED_EVENT_ALIASES`, `MEET_PERMISSION_ALIASES`). Those maps are the single source of truth every
  consumer derives from — never hardcode a pair. Give a deprecated alias the **same** payload as its
  canonical twin through an indexed access (`EmbeddedEventPayloads[EmbeddedEventName.MEETING_LEFT]`)
  so the two cannot drift. The plan behind this lives in
  `../openvidu-competitors/meet-update-plan/api-naming-migration-phase.md`.

## API naming charter

Every public identifier follows one scheme — learn a module once and you can predict its name on
every surface. `src/api-registry.ts` is the registry (`MEET_API_MODULES`, `MEET_API_REST_GROUPS`,
`meetApiModuleOf()`) **and the enforcement point**: `scripts/lint-api-naming.mjs` (repo root, run by
`./meet.sh lint-backend`, CI-gated) fails on any identifier that doesn't start with a registered
token.

- **Module token**: a singular, single-word lowerCamelCase noun, registered exactly once, never a
  prefix of another token. A concept needing two words is not a module — fold it into the closest
  one and put the extra word in the action (`mediaChangeVirtualBackground`, not a
  `virtualBackground` module).
- **Command** `moduleAction`: module first, then an imperative verb (`meetingLeave`,
  `participantKick`); bulk variants suffix `All`. **Event/webhook** `moduleEvent`: module first,
  past tense (`meetingJoined`, `recordingEnded`), same string on both surfaces.
- **Permission** `moduleAbility`: flat boolean, no `can` prefix, **flat forever** (nesting is
  rejected, not deferred — the prefix already groups). `Admin` is the only administrative verb
  (never `Manage`); a fully split module (like `recording`) has no `Admin`. **Split rather than
  lump**: if an operator would grant one half and withhold the other, they are two permissions.
  **Verb before object**, no exceptions. A permission may share its string with the command it
  gates (`participantKick`) — intentional.
- **REST**: live meeting state is a sub-resource of `/meetings/{roomId}`; only durable artifacts
  and platform groups are top-level (see `MEET_API_REST_GROUPS`). Collections plural, singletons
  singular. `operationId` = `moduleAction`.
- **Reserved words**: `broadcast` = RTMP only, `reaction` = emoji only, `message(s)` = chat only.
- **Known exceptions** the lint allows on purpose: the 3.8.0 deprecated aliases (derived from the
  alias maps, gone in 3.12.0) and the wrapper's `ready` event (outside the scheme, pending
  sign-off). `lobbyKnocked`/`participantKnocked` will be a deliberate cross-module alias when the
  lobby module lands.

## Change discipline

- `src/embedded/` and everything reachable from the **public** REST API (`/api/v1`) are external
  contracts. Additive changes only: new optional field, new enum member. Renaming or removing breaks
  host applications and API consumers.
- Adding a field to a persisted entity is a **schema change**: it also needs a backend migration, a
  bumped `*_SCHEMA_VERSION` and a refreshed `MIGRATION_REV` in
  `meet-ce/backend/src/config/internal-config.ts` (see `meet-ce/backend/src/migrations/README.md`).
- A change to `src/embedded/` usually also implies updating the OpenAPI specs (if it touches the API),
  the webcomponent loader's delegated surface (which it derives automatically), and regenerating the
  embedding docs with `./meet.sh build-webcomponent-doc`.
- PRO has its own `meet-pro/typings` package that layers on top; don't move CE contracts there.
