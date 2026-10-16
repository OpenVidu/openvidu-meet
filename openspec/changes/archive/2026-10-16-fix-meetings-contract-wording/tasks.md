# Tasks

## 1. Wording

- [x] 1.1 Rewrite the TSDoc of `MEDIA_SCREEN_SHARE_STATUS_CHANGED` in `meet-ce/typings/src/embedded/events.ts` to say it is emitted to the local participant when their screen share starts or stops, once the meeting is joined; verify the typings build and that `./meet.sh build-webcomponent-doc` prints the new text. Verified with `tsc -p tsconfig.build.json` in the typings package, run directly instead of `./meet.sh`.
- [x] 1.2 Remove the claim that `meetingRead` defaults to `meetingJoin` from the comment above the live-introspection routes in `meet-ce/backend/src/routes/meeting.routes.ts`, keeping at most that reading the live meeting is gated by `meetingRead`; verify with `./meet.sh lint-backend`. ESLint on `meeting.routes.ts` passes.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. Documentation-only change.
- [x] 2.2 openvidu.io `next`: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` and commit the changed `shared/meet/webcomponent/events.md`. Regenerated with `node scripts/generate-webcomponent-docs.js` from `feat/live-broadcast` plus these edits (the published reference already carries the live broadcast commands and events); only the rows of this batch changed. `check-web` passed: lint without errors, strict build without warnings.
