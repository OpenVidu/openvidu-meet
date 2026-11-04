# Tasks

## 1. Flags and guide

- [x] 1.1 In `dev()` of `scripts/dev/dev.sh`, fail with the usage message on any flag other than the supported ones, naming `--testapp` for `--webcomponent`. Verify by running `./meet.sh dev --webcomponent` and checking the exit code and message (without starting any watcher).
- [x] 1.2 Fix the `pnpm run dev` line in `meet-ce/frontend/webcomponent/CLAUDE.md` (it only watches the bundle build; the testapp starts with `./meet.sh dev --testapp`).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none (tooling and documentation).
- [x] 2.2 openvidu.io: none.
