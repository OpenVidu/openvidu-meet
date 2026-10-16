# Tasks

## 1. TSDoc

- [x] 1.1 Change "the lowest limit that can be set is `10`" to `1` in the TSDoc of `maxDurationMinutes` in `meet-ce/typings/src/database/room-config.ts`, and verify `./meet.sh build-typings` passes. Verified with `tsc -p tsconfig.build.json` in the typings package, run directly instead of `./meet.sh`.

## 2. Release surfaces

- [x] 2.1 No `CHANGELOG.md` line: documentation only, per the root `CLAUDE.md` changelog rules.
- [x] 2.2 openvidu.io: none.
