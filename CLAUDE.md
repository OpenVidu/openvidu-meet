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
| User documentation | openvidu.io (see "Documentation") |
| Release notes | `CHANGELOG.md` |

## Size the task first

A task runs only the steps its level needs. The level comes from what the task changes, never from how
hard it looks. Ask in this order and stop at the first yes:

1. **`spec`**: it changes what Meet does. A requirement or a scenario of `openspec/specs/` is added or
   reworded, or a public contract (REST API, webhooks, embedded API, room config fields, permission
   keys, environment variables) or persisted data changes.
2. **`code`**: it changes logic and every spec stays true as written. A fix that makes the code do what
   its spec says, a refactor, performance, a dependency (`/deps-update`), tests, tooling.
3. **`cosmetic`**: neither. Wording and translations, styles and spacing, an icon or an asset,
   comments, documentation.

| Step | `cosmetic` | `code` | `spec` |
| ---- | ---------- | ------ | ------ |
| Own worktree, `./meet.sh verify`, pull request with its CI | yes | yes | yes |
| OpenSpec change (next section) | no | no | yes |
| Who writes the code | main session | main session, or one implementer when it spans many files | main session the typings, then the implementers |
| Tests written | none: update the ones that quote what changed | one that fails without the fix; a refactor adds none | the ones the tasks name |
| `refactorer` | no | no | when product code was added |
| Tests run locally | the ones that quote what changed | `./meet.sh affected` | `./meet.sh affected` |
| `change-reviewer` | no | when product code changed | yes |
| `CHANGELOG.md`, openvidu.io | main session; a page only when it quotes what changed | main session | `docs-writer` |

- Reading the spec of the capability answers the first question: it is a lookup, not an estimate. Where
  the spec is silent, a fix with one sensible outcome is `code`; one that has to choose what Meet does
  is `spec`.
- Say the level and the fact that sets it in one line before starting ("code: the `recordings` spec
  already requires X, the backend returns Y"), so the user can correct it. The user can also name it.
- The level only goes up. When the work meets something of a higher level (a contract field, a
  migration, a scenario that has to be reworded), stop and restart at that level's first step.
- CI runs the suites the diff selects whole at every level, so a skipped local step is never the last
  check.

## The OpenSpec change (`spec` tasks)

A `spec` task is an OpenSpec change from its proposal to its archive; no other level opens one:

1. `/opsx:explore` (optional) to investigate, then `/opsx:propose <change-name>`: writes
   `openspec/changes/<change-name>/` with `proposal.md`, delta specs, `design.md` and `tasks.md`.
   Review them before any code is written. Design proposals live there too, never as loose
   markdown files at the repo root.
2. `/opsx:apply` implements the tasks. The tasks include the tests, the OpenAPI/TSDoc updates, the
   `CHANGELOG.md` line and the openvidu.io pages, so they land with the code.
3. `/opsx:archive` **inside the same pull request**, before merging: it folds the deltas into
   `openspec/specs/` and moves the change to `openspec/changes/archive/`, so `main` always carries
   specs that match its code. Reviewers read `proposal.md` and the delta specs before the code diff.

Three rules keep a change from going back to the start:

- **Decisions first, and they are the user's.** Whoever writes a proposal asks every question the request
  leaves open about the product, a public contract or the architecture (`openspec/config.yaml` spells
  out the three kinds), in numbered rounds with a recommended answer each, and decides none of them.
  Facts are looked up, not asked. The proposal opens with those decisions and who took each; nothing
  else is written while one is open, and one that appears during the implementation stops it until the
  user answers.
- **Small changes.** At most 10 spec deltas and one pull request. A larger feature is a series of
  changes that each deliver something a person can observe.
- **Two review rounds.** `spec-reviewer` reads the whole change once, then only what its findings
  changed. After that only a blocker reopens it; the rest becomes tasks.

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

## Dependencies and their documentation

- Before writing code against the API of a library (Angular and Angular Material, `livekit-client` and
  the LiveKit server SDK, Express 5, Mongoose, zod, Playwright, Jest), read its documentation for the
  version this repository pins instead of relying on memory: the `context7` MCP server of `.mcp.json`
  serves it (`resolve-library-id`, then `query-docs` with the version of the package's `package.json`).
  A query names the library and the question, never code or data of this repository.
- `/deps-update` updates every dependency that has a patch or minor release, and
  `/deps-update <package> ...` only the ones named, each run in its own worktree and draft pull request
  through `dependency-updater`.

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
./meet.sh affected                # the integration and e2e tests this change can break, with their commands
./meet.sh stack up <name>         # isolated backend on the shared Docker deployment (--testapp: its own testapp too)
./meet.sh dev                     # all watchers (typings, backend, frontend, API docs)
./meet.sh dev --testapp           # + testapp on :5080, webhook bridge on :5081, webcomponent bundle watcher
./meet.sh build                   # full build, correct order
./meet.sh start --prod            # run the built app
./meet.sh start-testapp           # testapp only (:5080 + :5081), for the embedding e2e suites
```

Single suites (each domain's `CLAUDE.md` documents what they cover):

```bash
./meet.sh test-unit-{backend,frontend,webcomponent}   # Jest, Karma (shared-meet-components), Jest
./meet.sh test-e2e-{frontend,console,webcomponent}    # Playwright: spa, console and webcomponent projects
./meet.sh lint-{backend,frontend,webcomponent}        # ESLint, fails on any warning
```

Flags on any command: `--skip-install`, `--skip-typings` (typings already built), `--skip-build`.

## Before calling a change done

- **`./meet.sh verify`** is the definition of done for everything that needs no infrastructure: Prettier
  on the changed files, OpenSpec, the OpenAPI lint, the frontmatter of `.claude/agents` and
  `.claude/rules`, and the unit suites the diff affects (tests, type-check and lint each). It picks the suites with `scripts/ci/changed-suites.mjs`, as CI does, and
  the CI unit jobs run it too. One line per step; a failure prints its excerpt and the path of the full
  log. `--fix` formats the changed files; never run Prettier over a directory, the repository is not
  uniformly formatted. It names the integration and e2e suites the diff selects and never runs them.
- **`./meet.sh affected`** narrows those suites to the tests the change can break: the test files the
  diff changed, plus the tests of the areas it touches, named by the OpenSpec capabilities of the change
  and by the source paths (the map is `scripts/dev/test-areas.mjs`; `verify` fails when a spec file or a
  capability is missing from it). It prints the command of each. Those are the ones to run locally, the
  changed test files first; the whole suites run in CI on the pull request, which a draft is enough to
  start. A selected suite with no targeted test is left to CI.
- **`./meet.sh doctor`** tells in a second whether the OpenVidu local deployment those tests need is
  usable (containers, LAN IP, built bundles, who holds :6080 and the testapp ports), with the fix for
  each problem. When it is up, run them; when it is not, report them as not run instead of reporting a
  pass.
- **`./meet.sh stack`** keeps test runs apart: several sessions share that deployment, so a test run
  never uses the default Mongo database, Redis DB 0 or the `openvidu-meet` subbucket.
  `stack up <name>` starts this checkout's backend on its own port, database, Redis DB and subbucket;
  `stack run <name> -- <command>` runs a test command on them (after `up` when a meeting has to start:
  only a listening backend receives LiveKit's webhooks); `stack down <name>` deletes them and
  `stack list` shows who runs what. `stack up <name> --testapp` also starts this checkout's testapp and
  webhook bridge on ports of the stack, with the stack's webhook pointed at them, which is what a
  webcomponent e2e run needs: never the testapp on :5080, which may belong to another checkout. LiveKit
  posts its webhooks to :6080 and to the stack ports its `livekit.yaml` lists; `doctor` shows them and
  how to add them.

## Agents

`.claude/agents/` defines the agents for the recurring jobs: `backend-implementer`,
`frontend-implementer`, `refactorer`, `test-runner`, `spec-reviewer`, `change-reviewer`,
`dependency-updater` and `docs-writer`. An agent reads this file and the rules, never the session's
memory, so what it must know lives in the repository.

- The level of the task says which of them it uses ("Size the task first").
- The main session writes the typings of a change first; backend and frontend groups then run side by
  side. At most two agents at once unless the user asks for more.
- After the implementation the order is `./meet.sh verify`, `refactorer`, the affected tests,
  `change-reviewer`, so what is tested and reviewed is what merges. `refactorer` removes what the change
  added and nobody needs, reuses what the codebase already had and leaves behavior, contracts and test
  assertions alone.
- Tests that need the local deployment run through `test-runner`, so their logs stay out of the main
  conversation. An implementer runs the end-to-end tests it wrote or rewrote before reporting them done.
- A change is made in its own worktree; `.claude/rules/worktrees.md` holds what differs there.
- An agent's report is a claim, with its commands and exit codes: check it (`./meet.sh verify`, the
  diff) before reporting the work as done. Agents do not commit; the main session does.

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
`scripts/verify.mjs`, then backend integration and the e2e suites. Suite selection, storage
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
