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
--type spec`. `./meet.sh verify --only openspec --all` validates them: the accepted specs for
structure, the open changes with `--strict`. `.claude/skills/openspec-*/` and
`.claude/commands/opsx/` are generated: after bumping `@fission-ai/openspec`, regenerate them with
`npx openspec update` instead of editing them.

## Documentation (openvidu.io)

The user documentation lives in the openvidu.io repository, expected as a sibling checkout at
`../openvidu.io`. Meet changes go to its `next` branch (the version in development), edited and
committed in place, without a worktree. Each spec's `## Purpose` names the pages that document it.

- Feature pages: `docs/meet/` (features, embedded tutorials and reference, deployment).
- Embedded API reference: when `meet-ce/typings/src/embedded/` changes, regenerate it with
  `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` (writes
  `shared/meet/webcomponent/{attributes,commands,events}.md`; without a target directory it lands in
  the git-ignored `docs/webcomponent/`).
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
  matching one in PRO to the same version: `node scripts/dev/pro-deps.mjs` lists the mismatches and
  `--fix` writes CE's versions into meet-pro. The committed lockfile covers meet-ce only, so with
  meet-pro cloned `./meet.sh install` resolves it on top and leaves the lockfile as committed; a
  dependency change regenerates the lockfile in a checkout without meet-pro (a git worktree has none).

## Build order (non-negotiable)

`typings` → `backend` → `shared-meet-components` → `frontend` → `webcomponent`.

Typings emit real JavaScript (enums are runtime values), so `meet-ce/typings/dist` must exist
before anything else compiles or runs. `./meet.sh build-typings` does this.

## Commands

Everything is driven by `./meet.sh` at the repo root (it wraps the pnpm scripts and handles
ordering). `./meet.sh help` lists all commands.

```bash
./meet.sh install                 # pnpm install for the whole workspace
./meet.sh doctor                  # local environment check: one line per check, with its fix
./meet.sh verify                  # is this change ready: static checks + the unit suites it affects
./meet.sh stack up <name>         # isolated backend on the shared Docker deployment
./meet.sh dev                     # all watchers (typings, backend, frontend, API docs)
./meet.sh dev --testapp           # + testapp on :5080, webhook bridge on :5081, webcomponent bundle watcher
./meet.sh build                   # full build, correct order
./meet.sh start --prod            # run the built app
./meet.sh start-testapp           # testapp only (:5080 + :5081), for the embedding e2e suites
```

Single suites (each domain's `CLAUDE.md` documents what they cover):

```bash
./meet.sh test-unit-{backend,frontend,webcomponent}   # Jest, Karma (shared-meet-components), Jest
./meet.sh test-e2e-{frontend,webcomponent}            # Playwright: spa project, webcomponent project
./meet.sh lint-{backend,frontend,webcomponent}        # ESLint, fails on any warning
```

Flags on any command: `--skip-install`, `--skip-typings` (typings already built), `--skip-build`.

## Before calling a change done

- **`./meet.sh verify`** is the definition of done for everything that needs no infrastructure: Prettier
  on the changed files, OpenSpec, the OpenAPI lint and the unit suites the diff affects (tests,
  type-check and lint each). It picks the suites with `scripts/ci/changed-suites.mjs`, as CI does, and
  the CI unit jobs run it too. One line per step; a failure prints its excerpt and the path of the full
  log. `--fix` formats the changed files; never run Prettier over a directory, the repository is not
  uniformly formatted. It lists the integration and e2e suites the diff selects and never runs them.
- **`./meet.sh doctor`** tells in a second whether the OpenVidu local deployment those suites need is
  usable (containers, LAN IP, built bundles, who holds :6080), with the fix for each problem. When it
  is up, run them; when it is not, report them as not run instead of reporting a pass.
- **`./meet.sh stack`** keeps test runs apart: several sessions share that deployment, so a test run
  never uses the default Mongo database, Redis DB 0 or the `openvidu-meet` subbucket.
  `stack up <name>` starts this checkout's backend on its own port, database, Redis DB and subbucket;
  `stack run <name> -- <command>` runs a test command on them (after `up` when a meeting has to start:
  only a listening backend receives LiveKit's webhooks); `stack down <name>` deletes them and
  `stack list` shows who runs what. LiveKit posts its webhooks to :6080 and to the stack ports its
  `livekit.yaml` lists; `doctor` shows them and how to add them.

## Development mode

`./meet.sh dev` runs the watchers (typings, REST API docs, backend, frontend). The frontend watcher
writes **directly into `meet-ce/backend/public/frontend`** and the webcomponent build into
`public/webcomponent`, which the backend serves and git ignores: a stale bundle there is the usual cause
of "my change isn't showing up" (`./meet.sh doctor` reports it); rebuild rather than debugging the
running app. A typings compile error stalls every other watcher by design. How the watchers are chained
is in `.claude/rules/dev-mode.md`, which loads when you open `meet.sh` or `scripts/dev/`.

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

`CHANGELOG.md` at the root, newest release first. **Review it on every commit and every PR**: a change
a user or an integrator can observe gets one line in the unreleased release, in the same commit that
makes it. Internal refactors, tests, build work and documentation-only changes get none, and neither
does a fix to a feature of the unreleased version itself (it belongs to that feature's entry). The
sections, the grouping and the writing rules are in `.claude/rules/changelog.md`, which loads when you
open `CHANGELOG.md`.

## CI

One workflow, `Tests` (`.github/workflows/ci.yaml`), ending in `All tests passed`, the only required
check of `main`. It runs on pull requests (a draft is enough), on pushes to `main`, nightly and on
dispatch, and only the suites a change affects: the static checks and the unit suites first, through
`scripts/verify.mjs`, then backend integration and both e2e suites. Suite selection, storage
providers, version pins and runners are in `.claude/rules/ci.md`, which loads when you open the
workflow, `scripts/ci/` or `scripts/verify.mjs`.

## Repo-wide gotchas

- Never edit generated output: `**/dist`, `meet-ce/backend/public/`, `docs/webcomponent/`,
  `.claude/skills/openspec-*/`, `.claude/commands/opsx/`.
- `screenshots/` and `videos/` are output of the `meet-screenshots` / `meet-videos` skills.
- **The API-naming migration plan predates OpenSpec and lives outside this repo**, in
  `../openvidu-competitors/meet-update-plan/` (`new-api-format.md`, the target contract;
  `api-surface-and-namespacing-impact.md`, the rationale; `api-naming-migration-phase.md`, the phase
  plan and its decisions). Do not copy it here. Its remaining step, removing the deprecated names in
  3.12.0, goes through an OpenSpec change like any other.
