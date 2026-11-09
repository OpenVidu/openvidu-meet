# Proposal

## Why

While live, a moderator who adds a destination the server refuses sees the failure that another
destination was showing disappear: its row goes from failed to stopped and its error text is gone. The
moderator loses the reason that destination failed.

## What Changes

- Dismissing the refusal of an added destination clears only the refusal, never the failures kept for
  the other destinations.
- Dismissing a failure remains what clears the kept failed broadcasts.
- No delta of its own: requirement "Destinations added in the meeting" of `add-live-broadcast` covers
  adding while live; a task adds the scenario that a refusal leaves other failures shown.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task adds a scenario to the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Meeting UI: the Live broadcast activity.
- Code: `BroadcastStateService` and `BroadcastActivityComponent` in
  `meet-ce/frontend/projects/shared-meet-components`.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- How the refusal is cleared on its own. Proposed: a `dismissRefusal()` in the state service that only
  unsets the refusal. Alternative: give `dismissFailure()` a parameter saying what to clear.

## Source

3.10.0 pre-release audit, finding BF-5 (low, verified-live), introduced by #120.
