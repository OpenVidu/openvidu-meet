# Webcomponent (`@openvidu-meet/webcomponent`)

Publishes `<openvidu-meet>` — the full Meet experience embedded **inline** in a host application's
DOM (no iframe), built with Angular Elements. The host app keeps its own business layer on top and
drives Meet through attributes/properties, DOM events and imperative methods.

This is a separate Angular project that reuses the same `@openvidu-meet/shared-components` library as
the SPA. It contains only the embedding shell: element registration, shadow-DOM plumbing, the
attribute→route mapping and the lazy loader. **Feature work belongs in the library**, not here.

## Bundles and how they are served

`pnpm run build:wc:bundle` = `build:wc:angular` (Angular build, entry `src/main.wc.ts`) →
`build:wc:post` (`scripts/concat-wc.js` bundles with esbuild, then `scripts/deploy-to-backend.js`).

Two artifacts are produced and deployed into `meet-ce/backend/public/webcomponent/`:

| Artifact | Served at | Purpose |
| -------- | --------- | ------- |
| `openvidu-meet-loader.js` | `<basePath>/v1/openvidu-meet.js` | Tiny (~KB) lazy loader — the **stable public URL** hosts embed |
| `openvidu-meet-wc.esm.js` | `<basePath>/v1/openvidu-meet.esm.js` | The heavy Angular+LiveKit ESM, `import()`ed on first use (CORS-enabled) |

The bundle is always served **by the backend** so host apps pick up a redeployed version without
changing their page. Caching contract (locked by backend unit tests + the `bundle-caching` e2e spec):
both files are served `no-cache` + a strong content-hash ETag (`.sha256` sidecar), so browsers
revalidate on every load — a 304 while unchanged, a full 200 with the new version on the first
load after a redeploy.

The ESM is deliberately ONE file: esbuild `splitting: true` was implemented and reverted
(2026-07-29, product decision) because serving the emitted `chunk-*.js` files requires sibling
public urls, and the distribution surface must stay at exactly the two stable urls above.

## Loader delegation (`src/main.loader.ts`)

The loader registers `<openvidu-meet>` immediately without loading Angular. On first
`connectedCallback` it sets `globalThis.__OV_MEET_SKIP_AUTODEFINE__`, `import()`s the ESM (which then
registers the real element as `openvidu-meet-impl`), and delegates to an inner `<openvidu-meet-impl>`:
attributes/properties are mirrored, imperative calls made before load are buffered and replayed, and
events are re-dispatched on the outer element.

- The delegated surface is derived from `EmbeddedAttribute` / `EmbeddedCommandName` /
  `EmbeddedEventName` in `@openvidu-meet/typings` — the single source of truth. Adding a public
  attribute/command/event means editing the typings first; the loader then picks it up automatically.
- `TEARDOWN_GRACE_MS` (10 ms) keeps a live meeting alive across a DOM *move* (re-parenting fires
  disconnect+connect synchronously); only a genuine removal tears it down. Don't shorten it.

## Element API

- **Attributes/properties** — kebab-case attribute ⇄ camelCase property: `room-url`,
  `recording-url`, `participant-name`, `participant-external-id`, `participant-metadata`,
  `e2ee-key`, `leave-redirect-url`, `show-only-recordings`, `show-recording`. Either `room-url` or
  `recording-url` is required.
- **Events** (`CustomEvent`, `detail` = payload): `meetingJoined`, `meetingLeft` (with
  `LeftEventReason`), `meetingClosed`, `participantJoined`/`participantLeft` (**remote**
  participants only; payload `{ roomId, participant: MeetParticipantPayload }` — identity,
  correlation fields and role; live transitions only, no replay of participants already present,
  no media state, and no client-side departure reason — the authoritative one travels on the
  `participantLeft` webhook), plus a `ready` event dispatched by the wrapper after first render.
  The 3.8.0 spellings (`joined`, `left`, `closed`) are dispatched **alongside** their
  canonical twin until **3.12.0** — a host listening to both names receives the event twice.
  `EmbeddedEventBusService`'s queue only ever carries canonical names; `src/app/app.ts` emits both
  outputs from a single switch on the canonical name, and the iframe bridge posts a second
  `postMessage` under the deprecated name via `deprecatedEmbeddedEventAliasOf()` from the typings.
- **Methods**: `meetingEnd()`, `meetingLeave()`, `participantKick(identity)`, and the convenience
  listener API `on()` / `once()` / `off()` added in `src/app/custom-element/wrapper.ts`. The 3.8.0
  spellings (`endMeeting`, `leaveRoom`, `kickParticipant`) stay as `@deprecated` aliases on the
  wrapper until **3.12.0**; they forward to the canonical method, so `src/app/app.ts` and
  `EmbeddedCommandService` only ever declare the canonical name. The iframe bridge accepts both wire
  names by running `resolveEmbeddedCommandName()` from the typings.
- No `.d.ts` is published; hosts declare the subset they use (see
  `testapp/src/app/openvidu-meet-element.ts`).

## Internals

- `src/main.wc.ts` — `bootstrapOpenViduMeet(tagName?)`: creates the Angular application, flips
  `RuntimeConfigService.enableWebcomponentMode()` **before** registering the element, then registers.
  Auto-defines `openvidu-meet` unless `__OV_MEET_SKIP_AUTODEFINE__` is set. Also injects the
  Roboto/Material font `<link>`s into the host document.
- `src/main.ts` — dev-only SPA harness (`ng serve`), same registration path.
- `src/app/app.ts` — root component, `ViewEncapsulation.ShadowDom`. Maps host inputs to a `WcRoute`,
  drives `WcRouterService`, renders the route's library component, and bridges events both ways.
  Effect order is significant: the server-base-URL effect must run before the navigate effect, because
  route guards call the API. Re-navigation is keyed on `wcRouteIdentity` so an unrelated attribute
  change doesn't yank the user off an interrupt view (login, recordings…).
- **No Angular Router**: there is no URL to own inside a host page, so `domains/embedded/` in the
  library provides a mini-router (`WcRouterService`, `WcRouteName`, `wcRouteFromAttributes`) that the
  HTTP interceptor also consults for the "current page".
- **Shadow DOM**: `shadow-dom/styles.service.ts` reflects styles into the shadow root
  (`adoptedStyleSheets`) and `shadow-dom/overlay-container.service.ts` re-hosts the CDK overlay
  container inside it — otherwise Material dialogs/menus render unstyled outside the shadow boundary.

## Commands

```bash
pnpm run build:wc:bundle   # build + bundle + deploy to backend/public/webcomponent
pnpm run dev               # watch build + testapp (scripts/dev.js)
pnpm run deploy:backend    # re-deploy an existing dist/ build
pnpm run test:unit         # Jest (ts-jest ESM, jsdom) over tests/unit
pnpm run test:e2e          # Playwright, project `webcomponent`
```

## Tests

- **Unit** (`tests/unit/`): loader delegation, wrapper API and the `deploy-to-backend` script
  contract (stable names + `.sha256` sidecars, exercised hermetically via `MEET_WC_DIST_DIR` /
  `MEET_BACKEND_PUBLIC_DIR`) — framework-agnostic logic. The Angular shell is covered by e2e instead
  of a TestBed. Config: `jest.config.mjs` (ts-jest ESM, typings mapped to source, SCSS stubbed).
- **E2E** (`tests/e2e/`): `attributes`, `bundle-caching`, `commands`, `events`, `room`,
  `identified-guest-state`, `webhooks`. They load the real bundle into the **testapp** and require a
  full environment — endpoints in `tests/config.ts`, overridable by env:
  - backend `http://localhost:6080/meet` (`MEET_API_URL`, `MEET_API_KEY`)
  - testapp `http://localhost:5080` (`MEET_TESTAPP_URL`) + webhook bridge on `:5081`
  - bundle `http://localhost:6080/meet/v1/openvidu-meet.js` (`MEET_WEBCOMPONENT_SRC`)

  Bring the environment up with `./meet.sh dev --testapp` from the repo root (or `./meet.sh dev` plus
  `./meet.sh start-testapp` in a second terminal). An `ERR_CONNECTION_REFUSED :5080` means the
  environment isn't up, not a code failure.

## Gotchas

- Two embedding modes share this API surface: this inline webcomponent and a cross-document
  `<iframe>` (bridged by `IframeBridgeService` in the library over `postMessage`). Keep the
  attribute/command/event contract identical for both; both are parametrized in the e2e suites.
- After changing the library, rebuild the bundle and re-deploy — the loader serves whatever is in the
  backend's `public/webcomponent/`, so a stale bundle silently masks your change.
- The Angular `wc` configuration builds with `outputHashing: none` and optimization on; the loader is
  built straight from TS with esbuild, so it must not import Angular (that would defeat the whole
  lazy-loading design).
