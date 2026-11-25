---
paths:
    - '.github/**'
    - 'scripts/ci/**'
    - 'scripts/verify.mjs'
---

# CI

- One workflow, `Tests` (`.github/workflows/ci.yaml`), runs every test suite. Its `Select suites` job
  picks the suites a change affects with `scripts/ci/changed-suites.mjs` (per-suite path patterns with
  the semantics of GitHub `paths` filters). `Static checks` (`verify --only static`) runs on every
  change. The unit suites (backend, frontend, webcomponent; tests and lint) run first, each as
  `verify --only <suite>`, so `scripts/verify.mjs` is the one definition of their steps; backend
  integration and the e2e suites start only if none of them failed. It ends
  in `All tests passed`, the only required status check of `main`: renaming, splitting or adding jobs
  never touches the ruleset. Repeated steps are YAML anchors defined at their first use, so a version
  is pinned in one place. Suites use Node `24.22.3` (same pin as `meet-ce/docker/Dockerfile`) and pnpm
  `11.29.0`. Every job runs on GitHub-hosted `ubuntu-24.04` runners, free for this public repo (the
  integration and e2e jobs start the OpenVidu local deployment there, faster than on the shared
  self-hosted runners, which Meet no longer uses). pnpm is pinned by
  `packageManager` in the root `package.json`, which the Docker build follows; `pnpm/action-setup`
  fails if its `version` differs. Most suites watch `meet.sh` and `scripts/verify.mjs` because CI calls
  them, so dev-mode logic lives in `scripts/dev/` (`dev.sh`, `doctor.mjs`, `stack.mjs`), which no suite
  watches. Markdown and `nodemon*.json` never select a suite.
- CI runs on pull requests: a branch gets CI once it has a PR (a draft is enough) or by dispatching
  `Tests` (input `suites`, `all` by default, or a comma-separated list). A push to `main` runs the suites it
  affects, like a pull request, except that a change touching only the backend does not select the e2e
  suites (the integration suite covers it), and the nightly (06:00 UTC) runs every suite, only when `main` moved
  since the last green nightly. On a pull request or a push, recordings run on S3 only, unless the change
  touches `meet-ce/backend/src/services/storage/` or the pull request carries the `ci:storage` label
  (read when a run starts, so add it before pushing): GCS and ABS share one bucket each, which every
  recordings job empties first. The nightly and dispatched runs use S3, GCS and ABS. Dependabot groups all
  action bumps in one PR.
- CI always runs the whole suites it selects. `./meet.sh affected` (`scripts/dev/affected-tests.mjs`)
  narrows the same selection to the tests worth running locally, from the map of areas in
  `scripts/dev/test-areas.mjs`; `Static checks` fails when a spec file, an integration folder or an
  OpenSpec capability is missing from that map, when one of its paths matches no file or one of its
  `--grep` matches no test, and when a case of `scripts/dev/affected-tests.test.mjs` no longer holds.
  `node scripts/dev/affected-replay.mjs` measures the map on the merged pull requests: from the files of
  each one, would it have listed the integration and e2e tests that pull request changed. A test it
  missed becomes a case of the test file. A change under `meet-ce/typings/src/embedded/` does not
  select backend integration, because the backend uses nothing from that folder: a value both sides
  need lives outside it (`leave-reason.ts`, `event-origin.ts`).
