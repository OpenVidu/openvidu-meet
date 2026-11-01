# Proposal

## Why

When a holder of `participantHandLower` leaves a meeting while a raised-hand notice is on screen, the notice stays over the end screen for up to five seconds. Its Lower hand action then asks the server to lower a hand in a meeting the participant already left, and fails with "The hand could not be lowered".

## What Changes

- Leaving the meeting takes the raised-hand notice off screen, as the chat notices already are, so the end screen never shows it and its Lower hand action cannot be used after leaving.
- The `raise-hand` spec states that the notice goes away when its holder leaves the meeting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `raise-hand`: "Holders of participantHandLower are notified of raised hands" adds that the notice goes away when the holder leaves the meeting, with a scenario.

## Impact

- Meeting UI: the end screen no longer shows the raised-hand notice of the meeting just left.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected. No public contract changes.
- Code: `onParticipantLeft` of `MeetingEventHandlerService` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/meeting-event-handler.service.ts`), which drops the notice reference without dismissing the notice.
- openvidu.io: none (`docs/meet/features/meetings/raise-hand.md` does not describe how long the notice lasts).

## Decisions to confirm

- None. The fix removes a leftover of the meeting just left.

## Source

3.10.0 pre-release audit, finding MT-3 (low, static-high), introduced by #109.
