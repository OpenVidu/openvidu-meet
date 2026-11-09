# Proposal

## Why

When the server refuses something a moderator asks while the meeting is live, typically two moderators
pressing Go live or Start on the same destination, the Live broadcast activity shows a red banner with no
way to dismiss it: it stays until the moderator asks something else. And when the server refuses a
destination added while live, the failures of the other destinations and their errors vanish from the
activity, so a destination that failed looks merely stopped.

## What Changes

- A refused request shown while broadcasts are in progress offers Dismiss, which clears that refusal
  only; the destinations keep their statuses.
- A destination added while live and refused by the server clears only its own refusal, shown in its
  editor as today; the failed broadcasts of the other destinations keep their failed status and error.
- When every broadcast failed, Try again and Dismiss work as today and clear the failures too.
- No delta of its own: the requirements "Destinations added in the meeting" ("a refusal SHALL keep its
  editor open with the server's message while the other broadcasts go on") and "Controlling each
  destination while live" of the `live-broadcast` delta of `add-live-broadcast` get scenarios for both
  cases.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task adds the scenarios to the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Meeting UI: the failure banner and the destination rows of the Live broadcast activity.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `BroadcastStateService` and `BroadcastActivityComponent` in
  `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.
- openvidu.io: none.

## Decisions to confirm

- Whether a refusal shown while live goes away by itself. Proposed: no, it stays until dismissed or
  until something else is asked, like a failure. Alternative: clear it on its own after a few seconds or
  on the next change of the broadcasts.

## Source

3.10.0 pre-release audit, findings BF-4 (low, verified-live) and BF-5 (low, verified-live), introduced by #120.
