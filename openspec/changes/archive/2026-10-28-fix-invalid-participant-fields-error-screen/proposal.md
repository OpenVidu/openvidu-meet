# Proposal

## Why

When the server refuses a join with `422` because `participant-external-id` or `participant-metadata` break their limits, the meeting shows the generic "internal error" screen: the participant is told something went wrong on the server, and the integrator gets no hint that their own attributes are the cause. The `meeting-join` spec states the `422` but not what the participant sees.

## What Changes

- A join refused with `422` shows a dedicated "Invalid participant data" error screen, translated like the other access error screens, saying the application that opened the meeting sent invalid participant data.
- The browser console logs the server's reason, which names the offending field.
- The screen behaves like every other access error screen: dismiss button, `embeddedCloseRequested` and leave redirect as `meeting-join` specifies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-join`: "Correlation field limits" states the error screen and the console log shown after the `422`.

## Impact

- Embedded API: no contract change; `participant-external-id` and `participant-metadata` keep their limits.
- Meeting UI: a new error screen, in the 10 supported languages, in every embedding mode.
- REST API: none; the internal `generateRoomMemberToken` keeps answering `422`.
- Webhooks, console UI, deployment configuration: not affected.
- Code: the join token error mapping of the meeting lobby, the navigation error reasons and their shared translations in the `shared-meet-components` library.
- openvidu.io: none. The error screens are not listed on the site.

## Decisions to confirm

- The invalid values are reported after the participant presses join, on a dedicated error screen (proposed). Alternative: validate both attributes when the entry starts and show the error before the join screen, which duplicates the server's limits in the client.
- Screen title "Invalid participant data" (proposed wording); the message addresses the participant, not the integrator, and the technical reason goes to the console only.
