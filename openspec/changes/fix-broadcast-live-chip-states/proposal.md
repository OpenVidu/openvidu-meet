# Proposal

## Why

The LIVE mark in the status rail says Starting whenever any destination is connecting, even while
another has been live for an hour, so every participant loses the time on air each time a moderator adds
or retries a destination. While the last broadcast is stopping, the mark reads LIVE 0:00:00.

## What Changes

- The mark says Starting only until the first destination receives media. From then on it shows the time
  since the earliest destination still on air went live, while other destinations connect.
- While the last broadcasts are ending, the time keeps counting until they end. A broadcast that ends
  without ever reaching its destination leaves the mark with no time instead of 0:00:00.
- The Live broadcast activity reads the same clock, so its time follows.
- No delta of its own: the requirement "Live status shown to every participant" of the `live-broadcast`
  delta of `add-live-broadcast` already states it ("saying Starting until a destination receives media
  and then the time since the earliest live destination began"); a task adds the two scenarios it lacks.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with "Live status shown to every participant";
a task adds scenarios to the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Meeting UI: the LIVE chip of the status rail and the time of the Live broadcast activity, for every
  participant.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `BroadcastStateService` and `StatusRailComponent` in
  `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/`.
- openvidu.io: none (`docs/meet/features/meetings/live-broadcast.md` already describes the time on air
  since the first destination received the meeting).

## Decisions to confirm

- What the mark shows while the last broadcast is ending. Proposed: the time on air keeps counting until
  it ends. Alternative: drop the time and show only LIVE while ending.

## Source

3.10.0 pre-release audit, finding BF-3 (low, verified-live), introduced by #120.
