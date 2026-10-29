# OpenVidu Meet

Self-hosted video conferencing product shipped with every OpenVidu deployment. It is a full
application (not a library): user accounts with login, granular roles and per-room permissions,
rooms, recordings, analytics and webhooks. It can also be **embedded** into third-party apps so the
host application keeps control of data, interaction and customization.

Two editions live side by side: **CE** (`meet-ce/`, Apache-2.0, this repo) and **PRO**
(`meet-pro/`, separate private repo, cloned into this tree and **git-ignored**). PRO reuses CE by
extending/overriding it (see "Edition model" below).

## Repository layout

pnpm workspace (`pnpm-workspace.yaml`). Workspace package names are what `pnpm --filter` expects:

| Path                                                 | Package                               | Role |
| ---------------------------------------------------- | ------------------------------------- | ---- |
| `meet-ce/typings`                                    | `@openvidu-meet/typings`              | Shared contracts (backend ⇄ frontend ⇄ embedding API) |
| `meet-ce/backend`                                    | `@openvidu-meet/backend`              | Node.js + Express 5 REST API; also serves the built frontend |
| `meet-ce/frontend`                                   | `@openvidu-meet/frontend`             | Angular SPA shell (thin) |
| `meet-ce/frontend/projects/shared-meet-components`   | `@openvidu-meet/shared-components`    | Angular library: **all UI logic lives here** |
| `meet-ce/frontend/webcomponent`                      | `@openvidu-meet/webcomponent`         | `<openvidu-meet>` custom element (Angular Elements) |
| `testapp`                                            | `@openvidu-meet/testapp`              | Host app used to exercise webcomponent + iframe embedding |

Each package above has its own `CLAUDE.md` with the details (the frontend one also covers
`shared-meet-components`); read it before working there. `openspec/` holds the product specification (next
section).

## Spec-driven development (OpenSpec)

`openspec/specs/` is the **source of truth for what Meet does**: one folder per capability (`rooms`,
`recordings`, `embedded-api`, `deployment`, …), each a list of requirements with testable scenarios.
The code implements the specs; when they disagree, one of them has a bug. Other artifacts own the
details the specs only name:

| What | Source of truth |
| ---- | --------------- |
| Behavior: what happens, for whom, gated by which permission, how it fails | `openspec/specs/` |
| REST API and webhooks wire contract | OpenAPI in `meet-ce/backend/openapi/` |
| Embedded API reference (attributes, commands, events) | TSDoc in `meet-ce/typings/src/embedded/` |
| User documentation | openvidu.io (see next section) |
| Release notes | `CHANGELOG.md` |

Every change a user, an integrator or an operator can observe goes through an OpenSpec change;
refactors, dependency bumps, tests and tooling do not need one:

1. `/opsx:explore` (optional) to investigate, then `/opsx:propose <change-name>`: writes
   `openspec/changes/<change-name>/` with `proposal.md`, delta specs, `design.md` and `tasks.md`.
   Review them before any code is written. Design proposals live there too, never as loose
   markdown files at the repo root.
2. `/opsx:apply` implements the tasks. The tasks include the tests, the OpenAPI/TSDoc updates, the
   `CHANGELOG.md` line and the openvidu.io pages, so they land with the code.
3. `/opsx:archive` **inside the same pull request**, before merging: it folds the deltas into
   `openspec/specs/` and moves the change to `openspec/changes/archive/`, so `main` always carries
   specs that match its code. Reviewers read `proposal.md` and the delta specs before the code diff.

The project context and the per-artifact rules every proposal follows (editions, deployment
topologies, sources of truth, documentation) live in `openspec/config.yaml`; keep them there, not
here. Two of them shape most designs:

- **CE only.** This repo is public: specs and changes here never describe PRO features. PRO
  specifies its own behavior in `meet-pro/` with its own `openspec/` once PRO work resumes.
- **Any number of replicas.** Meet runs on OpenVidu Single Node, Elastic and High Availability; in
  HA several Meet replicas share MongoDB, Redis and storage. See the `deployment` spec.

The CLI is a root devDependency, so run it as **`npx openspec`** (the generated skills write a bare
`openspec`; it is the same command): `npx openspec list --specs`, `npx openspec show <capability>
--type spec`, `npx openspec validate --all --strict`. `.claude/skills/openspec-*/` and
`.claude/commands/opsx/` are generated: after bumping `@fission-ai/openspec`, regenerate them with
`npx openspec update` instead of editing them.

## Documentation (openvidu.io)

The user documentation lives in the openvidu.io repository, expected as a sibling checkout at
`../openvidu.io`. Meet changes go to its `next` branch (the version in development), edited and
committed in place, without a worktree. Each spec's `## Purpose` names the pages that document it.

- Feature pages: `docs/meet/` (features, embedded tutorials and reference, deployment).
- Embedded API reference: when `meet-ce/typings/src/embedded/` changes, regenerate it with
  `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` (writes
  `shared/meet/webcomponent/{attributes,commands,events}.md`).
- REST API reference: when the public OpenAPI changes, regenerate it with
  `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html`.
- Release notes (`docs/meet/releases.md`) are written on release day, not by each change.

## Edition model (why the code is shaped this way)

- All UI logic sits in the `shared-meet-components` library, **not** in the SPA. CE and PRO
  frontends are thin shells that compose library routes and components. This exists so PRO can add
  features by overriding/extending components instead of forking them.
- The same applies to the backend: PRO depends on the CE backend package and overrides services.
- Consequence: when adding CE features, keep seams open (injectable services, content projection,
  route config arrays). Do not inline logic into `meet-ce/frontend/src/`; put it in the library.
- `meet-pro/` is git-ignored and may not be present, and has pre-existing build errors unrelated to
  CE work: don't try to fix those unrelated errors from a CE session, and don't assume PRO builds
  cleanly. Dependency **versions** are the exception: a dependency shared between `meet-ce/*` and
  `meet-pro/*` must be kept at the same version in both. This workspace uses `nodeLinker: hoisted`
  with one lockfile across CE and PRO, so a version mismatch on a shared dependency silently installs
  two copies side by side instead of erroring, which can break TypeScript structural typing (hit this
  with `@aws-sdk/client-s3`/`@smithy/*`). When bumping a shared dependency in CE, also bump the
  matching one in PRO to the same version.

## Build order (non-negotiable)

`typings` → `backend` → `shared-meet-components` → `frontend` → `webcomponent`.

Typings emit real JavaScript (enums are runtime values), so `meet-ce/typings/dist` must exist
before anything else compiles or runs. `./meet.sh build-typings` does this.

## Commands

Everything is driven by `./meet.sh` at the repo root (it wraps the pnpm scripts and handles
ordering). `./meet.sh help` lists all commands.

```bash
./meet.sh install                 # pnpm install for the whole workspace
./meet.sh dev                     # all watchers (typings, backend, frontend, API docs)
./meet.sh dev --testapp           # + testapp on :5080, webhook bridge on :5081, webcomponent bundle watcher
./meet.sh build                   # full build, correct order
./meet.sh start --prod            # run the built app
./meet.sh start-testapp           # testapp only (:5080 + :5081), for the embedding e2e suites
```

Tests (each domain's `CLAUDE.md` documents what they cover):

```bash
./meet.sh test-unit-backend       # Jest
./meet.sh test-unit-frontend      # Karma, shared-meet-components
./meet.sh test-unit-webcomponent  # Jest
./meet.sh test-e2e-frontend       # Playwright: spa project only
./meet.sh test-e2e-webcomponent   # Playwright: webcomponent project only
./meet.sh lint-backend            # ESLint, fails on any warning
./meet.sh lint-frontend
./meet.sh lint-webcomponent       # ESLint, webcomponent/src + webcomponent/tests only
```

CI-friendly flags on any command: `--skip-install`, `--skip-typings`, `--skip-build`.

The app is served at <http://localhost:6080/meet> in dev (backend port `6080`, base path `/meet`).

## Development mode mechanics

`./meet.sh dev` runs watchers under `concurrently` (typings, REST API docs, backend, frontend). The
CE frontend compiles the library from source, so there is no library watcher; PRO adds one because
it consumes the library's `dist`. Two details matter when things look stale:

- The typings watcher writes `meet-ce/typings/dist/typings-ready.flag`; every other watcher runs
  behind `scripts/dev/watch-with-typings-guard.mjs`, which waits for that flag and restarts its
  child when typings recompile. A typings compile error therefore stalls the other watchers by
  design.
- The frontend `ng build --watch` writes **directly into `meet-ce/backend/public/frontend`**, and
  the webcomponent build deploys into `meet-ce/backend/public/webcomponent`. The backend serves
  those directories. `public/` is git-ignored; a stale bundle there is the usual cause of "my change
  isn't showing up"; rebuild rather than debugging the running app.

## Code style

- **Simplicity is the goal.** Fixing a bug or adding a feature must leave the code simpler and easier
  to read and maintain, never more complex. Spend the smallest amount of technical complexity that
  solves the problem; prefer removing code to adding it.
- **Refactor before you add.** When resolving a bug, prefer refactoring, deleting and restructuring the
  existing code over piling new code on top. Reworking what is there keeps the system smaller; a fix
  that only adds is the last resort, not the first.
- **Few comments.** Code must read and explain itself; if it needs a comment to be understood, it is
  written wrong: rename, restructure or simplify instead. Never write historical-narrative comments
  or comments that explain a bug fix or how a problem was solved (that belongs in commits, not the
  source). A rare comment is acceptable only to state a genuine non-obvious constraint the code cannot
  express. (Typings are the one exception: `meet-ce/typings/src` requires a concise TSDoc on every
  exported member because the docs are generated from it; keep those factual, not narrative.)
- Prettier (`.prettierrc`) is the formatter: **tabs**, tab width 4, print width 120, single quotes,
  no trailing commas, semicolons. Match it; do not reformat unrelated code.
- ESLint is flat-config (`eslint.config.mjs`) per package and runs with `--max-warnings 0`, so
  warnings fail CI. Both backend and frontend enforce blank lines around `if`/`for`/`while`/`switch`
  and between class methods.
- TypeScript 6.0 everywhere, `strict`. Backend is ESM (`"type": "module"`) and therefore needs
  explicit `.js` extensions on relative imports.

## Changelog

`CHANGELOG.md` at the root, newest release first. **Review it on every commit and every PR**: a
change a user or an integrator can observe gets its line in the unreleased release in the same
commit that makes it. Internal refactors, tests and build work do not.

**Documentation-only changes never get a line**, however visible the document is: correcting the
OpenAPI, a TSDoc or a website page so it finally describes behaviour the server already had changes
nothing a reader can observe in the product. The changelog records what the software does
differently, not what we finally wrote down about it. The same goes for a fix to a feature of the
unreleased version itself: there is no previous release it differs from, so it belongs to that
feature's existing entry, not to a `Fixed` line of its own.

A release uses these sections, in this order, omitting the empty ones:

`Upgrade notes` → `Breaking changes` → `Deprecated` → `Added` → `Improved` → `Fixed`

`Added`, `Improved` and `Fixed` group their entries under `Integration`, `UI` and `Deployment`,
defined once at the top of the file: the surfaces a host application is built against, what a
person using Meet sees, and running the server.

- **One line per change**, in the present tense. What changed, not why, not how it behaves, not
  what the reader should do about it.
- **One entry per feature, not per surface.** A capability that reaches the REST API and the
  embedded API is one line naming both, never one line each: split entries dissolve a headline
  feature into a list. A permission belongs in the entry that uses it, never in an entry of its
  own, so the reader never meets a permission before the thing it gates.
- **Order the entries of a subsection by feature**, so the list does not jump between unrelated
  ones and never mentions something it explains later.
- **No recommendations.** No `must`, no `should`, no second person. A remedy is stated as a fact:
  "the unchanged object is accepted", never "echo the object back unchanged".
- **No API reference.** Endpoint tables, payload fields, status semantics and enum meanings live
  in `meet-ce/backend/openapi/` and in the typings TSDoc, which generate the published docs. Link
  them instead of restating them.
- **Name the identifiers that changed**: endpoints, configuration fields, commands, events,
  permissions, enum values. That is what a reader searches for.
- **Say what actually gates a capability**: the permission the server checks, not the role that
  usually holds it. Check the route and the service before writing it.
- **A fix says what was wrong and then what is true now**, in one or two sentences. No story of
  the bug, no consequences, no rationale: that belongs in the commit message.
- Tables only for mappings, such as a deprecated name to its replacement.

Links to the REST API reference are markdown reference-style definitions collected at the end of
the file, labelled with the release (`[3.9-meetings]`) because the published URL is version-pinned
to `https://openvidu.io/<version>/meet/embedded/reference/api.html`. Anchors follow the convention
the OpenAPI sources already use for their own cross-references: `#/operations/<operationId>`,
`#/webhooks/<operationId>` and `#/schemas/<Schema>`.

## Tests, CI and docs

- GitHub workflows in `.github/workflows/` are path-filtered per package (backend unit/integration,
  frontend unit/e2e, webcomponent unit/e2e) and use Node `24.15.0` (same pin as
  `meet-ce/docker/Dockerfile`) and pnpm `11.8.0`. Unit jobs run on GitHub-hosted `ubuntu-24.04`
  runners, free for this public repo; the integration and e2e jobs need the OpenVidu local deployment
  and run on the shared self-hosted runners. pnpm is pinned by `packageManager` in the root
  `package.json`, which the Docker build follows; `pnpm/action-setup` fails if its `version` differs.
  Most jobs watch `meet.sh` because CI calls it, so dev-mode logic lives in `scripts/dev/dev.sh`
  (sourced only by `./meet.sh dev`), which no workflow watches. Markdown and `nodemon*.json` never
  trigger a job.
- Workflows trigger on pull requests: a branch gets CI once it has a PR (a draft is enough) or through
  `workflow_dispatch`. On `main`, the unit workflows run on every push; backend integration and both
  e2e suites run nightly instead (00:17 UTC), only when `main` moved since their last green nightly
  (the `main-changed` job skips the rest), because the required checks are strict and the PR already
  ran them on the tree `main` gets. On a pull request recordings run on S3 only, unless it changes
  `meet-ce/backend/src/services/storage/` or carries the `ci:storage` label (the `storage-providers`
  job in `backend-integration-test.yaml`; the label is read when a run starts, so add it before
  pushing); the nightly and `workflow_dispatch` run S3, GCS and ABS. Dependabot pull requests run only
  the unit workflows: their integration and e2e jobs skip on GitHub-hosted runners (matrix jobs skip
  their steps, so the required checks still report) and the nightly tests the merge; dispatch the
  workflow on the Dependabot branch to test it before. Dependabot groups all action bumps in one PR.
- Backend integration tests and all Playwright suites need real infrastructure (LiveKit, MongoDB,
  Redis, S3/MinIO). They are not runnable from a bare checkout: say so instead of reporting a pass.
- `./meet.sh build-rest-api-doc` and `./meet.sh build-webcomponent-doc` generate the API references
  (see "Documentation (openvidu.io)"); without a target directory the embedded one lands in the
  git-ignored `docs/webcomponent/`.

## Repo-wide gotchas

- Never edit generated output: `**/dist`, `meet-ce/backend/public/`, `docs/webcomponent/`,
  `.claude/skills/openspec-*/`, `.claude/commands/opsx/`.
- `screenshots/` and `videos/` are output of the `meet-screenshots` / `meet-videos` skills.
- **The API-naming migration plan predates OpenSpec and lives outside this repo**, in
  `../openvidu-competitors/meet-update-plan/` (`new-api-format.md`, the target contract;
  `api-surface-and-namespacing-impact.md`, the rationale; `api-naming-migration-phase.md`, the phase
  plan and its decisions). Do not copy it here. Its remaining step, removing the deprecated names in
  3.12.0, goes through an OpenSpec change like any other.
