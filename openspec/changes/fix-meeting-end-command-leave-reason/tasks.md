# Tasks

## 1. The issuer of meetingEnd ends the meeting "by self"

- [ ] 1.1 Move the "ended by self" mark into one place used by both the leave menu's End meeting option and the `meetingEnd` command (for example the moderation service's end call), setting it before the request and clearing it when the request fails; verify with Karma specs in `embedded-command.service.spec.ts` (the command marks it) and `meeting-event-handler.service.spec.ts` (a failed end leaves a later `meeting_ended` untouched).
- [ ] 1.2 Make the reason assertions of `meet-ce/frontend/webcomponent/tests/e2e/commands.test.ts` and `events.test.ts` exact instead of substring matches, expect `meeting_ended_by_self` for the issuer of `meetingEnd`/`endMeeting` and `meeting_ended` for another participant; report the suites as not run if the local deployment is unavailable.

## 2. Contract wording

- [ ] 2.1 Rewrite the TSDoc of `LeftEventReason.MEETING_ENDED` in `meet-ce/typings/src/embedded/events.ts` to: the meeting was ended for everyone by someone or something other than the local participant (another participant, the `meetingEnd` REST operation or command of another participant, or the forced deletion or closing of its room); it is also the only end reason `participantLeft` carries. Verify the typings build and that `./meet.sh build-webcomponent-doc` prints the new text.

## 3. Release surfaces

- [ ] 3.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "- The embedded commands `meetingEnd` and `endMeeting` reported `meeting_ended` in the `meetingLeft` event of the participant whose host ended the meeting. They now report `meeting_ended_by_self`, as ending it from the leave menu does."
- [ ] 3.2 openvidu.io `next`: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` and commit the changed `shared/meet/webcomponent/events.md`.
