# Tasks

## 1. The issuer of meetingEnd ends the meeting "by self"

- [x] 1.1 Move the "ended by self" mark into one place used by both the leave menu's End meeting option and the `meetingEnd` command (for example the moderation service's end call), setting it before the request and clearing it when the request fails; verify with Karma specs in `meeting-moderation.service.spec.ts`, where the mark now lives (an end marks it before the request; a refused end withdraws it, so a later end by someone else stays `meeting_ended`). `embedded-command.service.spec.ts` already checks that `meetingEnd` goes through that call.
- [ ] 1.2 Make the reason assertions of `meet-ce/frontend/webcomponent/tests/e2e/commands.test.ts` and `events.test.ts` exact instead of substring matches, expect `meeting_ended_by_self` for the issuer of `meetingEnd`/`endMeeting` and `meeting_ended` for another participant; report the suites as not run if the local deployment is unavailable.

## 2. Contract wording

- [x] 2.1 Rewrite the TSDoc of `LeftEventReason.MEETING_ENDED` in `meet-ce/typings/src/embedded/events.ts` to: the meeting was ended for everyone by someone or something other than the local participant (another participant, the `meetingEnd` REST operation or command of another participant, or the forced deletion or closing of its room); it is also the only end reason `participantLeft` carries. Verify the typings build. (The generated reference lists the reason values in the `meetingLeft` payload type, not each value's TSDoc, so the text does not reach it.)

## 3. Release surfaces

- [x] 3.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "- The embedded commands `meetingEnd` and `endMeeting` reported `meeting_ended` in the `meetingLeft` event of the participant whose host ended the meeting. They now report `meeting_ended_by_self`, as ending it from the leave menu does."
- [x] 3.2 openvidu.io `next`: none. The generated `shared/meet/webcomponent/events.md` does not carry the TSDoc of each `LeftEventReason` value, so regenerating it changes nothing for this change.
