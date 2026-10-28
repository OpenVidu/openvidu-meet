# Proposal

## Why

When a participant ends the meeting from the leave menu, Meet remembers that they did and reports `meeting_ended_by_self` in their own `meetingLeft`. The embedded command `meetingEnd` (and its alias `endMeeting`) ends the meeting on behalf of the same local participant but skips that step, so the host that issued the command receives `meeting_ended`, the reason meant for participants whose meeting someone else ended. The webcomponent e2e tests did not catch it because they match the reason by substring, and `meeting_ended` is a prefix of `meeting_ended_by_self`.

Separately, the TSDoc of `LeftEventReason.MEETING_ENDED` says "A moderator ended the meeting for all participants", while the value also covers the `meetingEnd` REST operation and the forced deletion or closing of the room, and is the only end reason the `participantLeft` webhook and event carry.

## What Changes

- The `meetingEnd` command, and its deprecated alias `endMeeting`, mark the meeting as ended by the local participant before asking the server to end it, exactly as the leave menu's End meeting option does, so the issuer's `meetingLeft` carries `meeting_ended_by_self`. If the request fails the mark is cleared, so a later end by someone else is still reported as `meeting_ended`.
- The TSDoc of `LeftEventReason.MEETING_ENDED` describes every end it covers; the generated embedded API reference follows.
- The webcomponent e2e tests compare the reason exactly.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-join`: the requirement "Leave reasons" gets a scenario for an end requested through the `meetingEnd` command.

## Impact

- Embedded API: the issuer's `meetingLeft.reason` becomes `meeting_ended_by_self` after `meetingEnd`/`endMeeting`; the set of values is unchanged. TSDoc wording of `LeftEventReason.MEETING_ENDED` only.
- Meeting UI: the post-meeting screen of the issuer shows the "you ended the meeting" message instead of "the meeting was ended".
- REST API, webhooks, console UI, deployment configuration: not affected (`participantLeft` keeps `meeting_ended`).
- openvidu.io: the embedded API reference (`shared/meet/webcomponent/events.md`) is regenerated; no hand-written page changes.

## Decisions to confirm

- A host that ends the meeting with `meetingEnd` is told `meeting_ended_by_self`, the same as ending it from the leave menu (alternative: keep `meeting_ended` for command-driven ends and only document it, since the host already knows it issued the command).
