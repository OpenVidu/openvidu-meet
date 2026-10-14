# Tasks

## 1. Wording

- [ ] 1.1 Rewrite the TSDoc of `MEDIA_SCREEN_SHARE_STATUS_CHANGED` in `meet-ce/typings/src/embedded/events.ts` to say it is emitted to the local participant when their screen share starts or stops, once the meeting is joined; verify the typings build and that `./meet.sh build-webcomponent-doc` prints the new text.
- [ ] 1.2 Remove the claim that `meetingRead` defaults to `meetingJoin` from the comment above the live-introspection routes in `meet-ce/backend/src/routes/meeting.routes.ts`, keeping at most that reading the live meeting is gated by `meetingRead`; verify with `./meet.sh lint-backend`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line. Documentation-only change.
- [ ] 2.2 openvidu.io `next`: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` and commit the changed `shared/meet/webcomponent/events.md`.
