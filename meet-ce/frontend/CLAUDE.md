# Frontend (`@openvidu-meet/frontend`)

Angular 22, **standalone + zoneless + signals**, Angular Material. Two projects in `angular.json`:

- `openvidu-meet` — the SPA **shell** (`src/`). Intentionally tiny: `main.ts`, `app.config.ts`,
  `app.routes.ts`, and `src/app/customization/` re-exports. Add nothing else here.
- `shared-meet-components` — the Angular library (`projects/shared-meet-components/`) that contains
  **all** application logic: pages, components, services, guards, routes, i18n.

The split exists so PRO can extend/override CE behaviour instead of duplicating it. Any feature you
write goes in the library; the shell only composes it. See the root `CLAUDE.md` for the edition model.

The library is consumed through the TS path alias `@openvidu-meet/shared-components` →
`projects/shared-meet-components/src/public-api.ts`, so the app builds from library **source** and you
usually do not need `lib:build`. Everything public must be re-exported through the domain barrels up
to `public-api.ts` (shared first, then domains) or PRO/webcomponent cannot see it.

## Library structure

`projects/shared-meet-components/src/lib/` is organised by domain:

| Domain         | Owns |
| -------------- | ---- |
| `auth`         | login, forced password change, auth guards, token header/error handlers |
| `console`      | authenticated admin shell + overview / config / embedded pages, nav building |
| `rooms`        | room list, wizard, detail, room access guards |
| `room-members` | members list/form, member context, access links |
| `users`        | user CRUD |
| `recordings`   | recordings list, player, sharing |
| `meeting`      | the in-call experience (by far the largest) |
| `embedded`     | webcomponent/iframe embedding: command service, event bus, iframe bridge, WC mini-router |

`lib/shared/` holds cross-domain infrastructure: `services/`, `models/`, `guards/`, `pipes/`,
`interceptors/`, `components/`, `lang/`, `routes/base-routes.ts`.

## Routing

Each domain exports `DomainRouteConfig[]` (`route` + optional `navMetadata`) instead of raw `Routes`.
`shared/routes/base-routes.ts` assembles the top-level routes; `console.routes.ts` assembles the
console children, and the console navigation is generated from each entry's `navMetadata`
(`label`, `icon`, `order`, `allowedRoles`). To add a console page: add the config to your domain's
`*ConsoleRoutes` with `navMetadata` — do not touch the console component.

All pages are lazy (`loadComponent`). Multi-guard routes use `runGuardsSerially(...)` because order
matters (extract params → validate access → strip query params).

`src/app/app.routes.ts` shows the override seam: CE takes `baseRoutes` and swaps the
`room/:room-id` component for its own.

## Customization / override seam

`AppCeMeetingComponent` (library, `domains/meeting/pages/app-ce-meeting/`) is the pattern: it renders
`<ov-meeting>` and content-projects the customization components from
`domains/meeting/customization/` (toolbar buttons, leave button, more-options menu, invite panel,
waiting panel, participant item, settings extensions, custom layout). PRO composes the same
`<ov-meeting>` with its own set. So: put new in-call UI in a customization component and project it —
don't hardcode it inside the meeting component.

Under the hood, projected templates are collected into `TemplateRegistryService`, which exposes each
slot as a signal that any descendant can read reactively.

## `domains/meeting/openvidu-components/`

This was the separately published `openvidu-components-angular` npm library. It is now **vendored as
project source** so it can be refactored and improved without shipping breaking changes to external
consumers. It keeps its own internal structure (`components/`, `services/`, `directives/api|template`,
`models/`, `pipes/`) and handles LiveKit, layout, panels, devices, virtual background, E2EE, chat,
recording UI.

- `provideOpenViduComponents()` replaces the old `OpenViduComponentsModule.forRoot()`.
- It intentionally provides almost nothing: meeting services are `providedIn: 'root'` so the bundler
  keeps them (and their heavy MediaPipe/LiveKit/E2EE deps) in the lazy meeting chunk. **Do not add
  service providers there** — it pins those chunks into the initial bundle.
- Treat it as internal code you may refactor, but keep the public component/directive API stable.

## Conventions

- Services use Angular 22's `@Service()` (not `@Injectable({providedIn:'root'})`) — follow the
  surrounding files. Inject with `inject()`, never constructor params.
- State is signals: `signal`/`computed`, expose `asReadonly()`. `ChangeDetectionStrategy.OnPush`,
  native control flow (`@if`/`@for`/`@switch`), `class`/`style` bindings (never `ngClass`/`ngStyle`).
- **Storage**: never touch `localStorage`/`sessionStorage` directly in the library — ESLint blocks it.
  Persist through `BrowserStorageService`, the single storage engine (one prefix, one serialization,
  one availability guard).
- **HTTP**: call the API through `HttpService` (`api/v1` and `internal-api/v1` prefixes are constants
  on it). `httpInterceptor` is domain-agnostic: domains register an `HttpHeaderProvider` with
  `HttpHeaderProviderService` and an error handler with `HttpErrorNotifierService`. Registration
  happens via `provideAppInitializer` in `app.config.ts`, and **order matters** — the room-member
  handlers must be registered before the auth ones.
- **Runtime modes**: `RuntimeConfigService` is the source of truth for deployment base path, server
  base URL and mode (`isWebcomponentMode`, `isIframeMode`, `isEmbeddedMode`). Gate embedding-specific
  UI on those signals rather than sniffing the URL. In webcomponent mode API calls must wait for
  `isReadyForRequests`.
- **i18n**: custom engine (not Transloco). Per-scope JSON bundles under each domain's `lang/`,
  registered with `provideTranslations(<DOMAIN>_TRANSLATIONS)`; one shared language preference. Add
  keys to every locale file in the bundle.

## Commands

```bash
pnpm run dev            # ng build --watch → writes into ../backend/public/frontend
pnpm run build          # production build, same output path
pnpm run lib:build      # build the library (ng-packagr) — needed by webcomponent/PRO consumers
pnpm run lib:serve      # library watch build
pnpm run test:unit:lib  # Karma/Jasmine specs of the library (headless: --browsers=ChromeHeadlessCI)
pnpm run e2e:playwright:spa   # Playwright, `spa` project, against a running backend
pnpm run lint           # --max-warnings 0
```

The build has no dev-server output: it writes straight into the backend's `public/frontend`, and the
backend serves it at `<basePath>/`.

## Tests

- Unit: Karma + Jasmine + TestBed, specs co-located as `*.spec.ts` in the library (a handful today —
  services and utils, not components).
- E2E: Playwright specs in `e2e/` (`*.test.ts`, project `spa`, `tsconfig.test.json`). They drive real
  Chrome with fake camera/mic against a **running** Meet backend + LiveKit, so `workers: 1`,
  `fullyParallel: false`, and `retries: 2` in CI (parallel participant bootstraps cause environmental
  flakiness). Helpers/fixtures live in `e2e/helpers/` and `e2e/fixtures/`.

## Gotchas

- `scripts/copy-livekit-assets.mjs` runs on `postinstall` and before every build/serve; it vendors the
  livekit-client E2EE worker and the MediaPipe WASM into `src/assets/` (git-ignored, version-coupled).
  If E2EE or virtual background breaks after a dependency bump, re-run `pnpm run assets:livekit`. The
  `.tflite` selfie-segmenter model is committed because it has no npm package.
- The app build uses `preserveSymlinks: true` (pnpm workspace links) — keep it.
- Watch the initial-bundle budget (warn 4 MB / error 10 MB): eager value-imports from the meeting
  domain are the usual regression, since they drag LiveKit/MediaPipe out of the lazy chunk.
- `src/environments/environment*.ts` is swapped by `fileReplacements` per configuration
  (`production`, `ci`).
