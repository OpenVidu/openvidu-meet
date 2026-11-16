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
  integration and both e2e suites start only if none of them failed. It ends
  in `All tests passed`, the only required status check of `main`: renaming, splitting or adding jobs
  never touches the ruleset. Repeated steps are YAML anchors defined at their first use, so a version
  is pinned in one place. Suites use Node `24.22.1` (same pin as `meet-ce/docker/Dockerfile`) and pnpm
  `11.28.9`. Every job runs on GitHub-hosted `ubuntu-24.04` runners, free for this public repo (the
  integration and e2e jobs start the OpenVidu local deployment there, faster than on the shared
  self-hosted runners, which Meet no longer uses). pnpm is pinned by
  `packageManager` in the root `package.json`, which the Docker build follows; `pnpm/action-setup`
  fails if its `version` differs. Most suites watch `meet.sh` and `scripts/verify.mjs` because CI calls
  them, so dev-mode logic lives in `scripts/dev/` (`dev.sh`, `doctor.mjs`, `stack.mjs`), which no suite
  watches. Markdown and `nodemon*.json` never select a suite.
- CI runs on pull requests: a branch gets CI once it has a PR (a draft is enough) or by dispatching
  `Tests` (input `suites`, `all` by default, or a comma-separated list). A push to `main` runs the suites it
  affects, like a pull request, except that a change touching only the backend does not select the e2e
  suites (the integration suite covers it), and the nightly (00:17 UTC) runs every suite, only when `main` moved
  since the last green nightly. On a pull request or a push, recordings run on S3 only, unless the change
  touches `meet-ce/backend/src/services/storage/` or the pull request carries the `ci:storage` label
  (read when a run starts, so add it before pushing): GCS and ABS share one bucket each, which every
  recordings job empties first. The nightly and dispatched runs use S3, GCS and ABS. Dependabot groups all
  action bumps in one PR.
