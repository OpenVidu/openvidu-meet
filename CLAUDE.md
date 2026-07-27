# OpenVidu Meet

Self-hosted video conferencing product shipped with every OpenVidu deployment. It is a full
application (not a library): user accounts with login, granular roles and per-room permissions,
rooms, recordings, analytics and webhooks. It can also be **embedded** into third-party apps so the
host application keeps control of data, interaction and customization.

Two editions live side by side: **CE** (`meet-ce/`, Apache-2.0, this repo) and **PRO**
(`meet-pro/`, separate private repo, cloned into this tree and **git-ignored**). PRO reuses CE by
extending/overriding it — see "Edition model" below.

## Repository layout

pnpm workspace (`pnpm-workspace.yaml`). Workspace package names are what `pnpm --filter` expects:

| Path                                                 | Package                               | Role |
| ---------------------------------------------------- | ------------------------------------- | ---- |
| `meet-ce/typings`                                    | `@openvidu-meet/typings`              | Shared contracts (backend ⇄ frontend ⇄ embedding API) |
| `meet-ce/backend`                                    | `@openvidu-meet/backend`              | Node.js + Express 5 REST API; also serves the built frontend |
| `meet-ce/frontend`                                   | `@openvidu-meet/frontend`             | Angular SPA shell (thin) |
| `meet-ce/frontend/projects/shared-meet-components`   | `@openvidu-meet/shared-components`    | Angular library — **all UI logic lives here** |
| `meet-ce/frontend/webcomponent`                      | `@openvidu-meet/webcomponent`         | `<openvidu-meet>` custom element (Angular Elements) |
| `testapp`                                            | `@openvidu-meet/testapp`              | Host app used to exercise webcomponent + iframe embedding |

Each of the four domains has its own `CLAUDE.md` with the details; read it before working there.

## Edition model (why the code is shaped this way)

- All UI logic sits in the `shared-meet-components` library, **not** in the SPA. CE and PRO
  frontends are thin shells that compose library routes and components. This exists so PRO can add
  features by overriding/extending components instead of forking them.
- The same applies to the backend: PRO depends on the CE backend package and overrides services.
- Consequence: when adding CE features, keep seams open (injectable services, content projection,
  route config arrays). Do not inline logic into `meet-ce/frontend/src/` — put it in the library.
- `meet-pro/` is git-ignored and may not be present. It has pre-existing build errors unrelated to
  CE work; never "fix" CE by changing PRO, and never assume PRO builds.

## Build order (non-negotiable)

`typings` → `backend` → `shared-meet-components` → `frontend` → `webcomponent`.

Typings emit real JavaScript (enums are runtime values), so `meet-ce/typings/dist` must exist
before anything else compiles or runs. `./meet.sh build-typings` does this.

## Commands

Everything is driven by `./meet.sh` at the repo root (it wraps the pnpm scripts and handles
ordering). `./meet.sh help` lists all commands.

```bash
./meet.sh install                 # pnpm install for the whole workspace
./meet.sh dev                     # all watchers (typings, library, backend, frontend, API docs)
./meet.sh dev --testapp           # + testapp on :5080 and webhook bridge on :5081
./meet.sh dev --webcomponent      # + webcomponent bundle watcher
./meet.sh build                   # full build, correct order
./meet.sh start --prod            # run the built app
./meet.sh start-testapp           # testapp only (:5080 + :5081), for the embedding e2e suites
```

Tests (each domain's `CLAUDE.md` documents what they cover):

```bash
./meet.sh test-unit-backend       # Jest
./meet.sh test-unit-frontend      # Karma, shared-meet-components
./meet.sh test-unit-webcomponent  # Jest
./meet.sh test-e2e-frontend       # Playwright: spa + webcomponent projects
./meet.sh test-e2e-webcomponent   # Playwright: webcomponent project only
./meet.sh lint-backend            # ESLint, fails on any warning
./meet.sh lint-frontend
```

CI-friendly flags on any command: `--skip-install`, `--skip-typings`, `--skip-build`.

The app is served at <http://localhost:6080/meet> in dev (backend port `6080`, base path `/meet`).

## Development mode mechanics

`./meet.sh dev` runs watchers under `concurrently` (typings, shared library, REST API docs, backend,
frontend). Two details matter when things look stale:

- The typings watcher writes `meet-ce/typings/dist/typings-ready.flag`; every other watcher runs
  behind `scripts/dev/watch-with-typings-guard.mjs`, which waits for that flag and restarts its
  child when typings recompile. A typings compile error therefore stalls the other watchers by
  design.
- The frontend `ng build --watch` writes **directly into `meet-ce/backend/public/frontend`**, and
  the webcomponent build deploys into `meet-ce/backend/public/webcomponent`. The backend serves
  those directories. `public/` is git-ignored; a stale bundle there is the usual cause of "my change
  isn't showing up" — rebuild rather than debugging the running app.

## Code style

- Prettier (`.prettierrc`) is the formatter: **tabs**, tab width 4, print width 120, single quotes,
  no trailing commas, semicolons. Match it; do not reformat unrelated code.
- ESLint is flat-config (`eslint.config.mjs`) per package and runs with `--max-warnings 0`, so
  warnings fail CI. Both backend and frontend enforce blank lines around `if`/`for`/`while`/`switch`
  and between class methods.
- TypeScript 6.0 everywhere, `strict`. Backend is ESM (`"type": "module"`) and therefore needs
  explicit `.js` extensions on relative imports.

## Tests, CI and docs

- GitHub workflows in `.github/workflows/` are path-filtered per package (backend unit/integration,
  frontend unit/e2e, webcomponent unit/e2e) and run on a self-hosted runner with Node `24.15.0` and
  pnpm `11.8.0` (same pins as `meet-ce/docker/Dockerfile`).
- Backend integration tests and all Playwright suites need real infrastructure (LiveKit, MongoDB,
  Redis, S3/MinIO). They are not runnable from a bare checkout — say so instead of reporting a pass.
- Generated documentation:
  - REST API → `./meet.sh build-rest-api-doc` (from `meet-ce/backend/openapi/`).
  - Embedding API → `./meet.sh build-webcomponent-doc [dir]`, which parses the JSDoc of the enums in
    `meet-ce/typings/src/embedded/` into `docs/webcomponent/{attributes,commands,events}.md`
    (git-ignored; passing `dir` moves them there instead).

## Repo-wide gotchas

- Never edit generated output: `**/dist`, `meet-ce/backend/public/`, `docs/webcomponent/`.
- `screenshots/` and `videos/` are output of the `meet-screenshots` / `meet-videos` skills.
- `MEET-*.md` at the root are design proposals, not implemented state. `MEET-E2E-DOMAIN-STRATEGY.md`
  describes a *planned* move of frontend e2e to `tests/e2e/`; the suites still live in
  `meet-ce/frontend/e2e/`.
- The root `README.md` predates the `meet-ce/` reorganization and still shows Angular 20 and
  top-level `frontend/`, `backend/`. Trust the tree, not the README.
