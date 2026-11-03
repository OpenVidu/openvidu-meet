# Proposal

## Why

The clean-up of stale recordings stops an unresponsive recording process that the media server still lists, but if the
media server refuses the stop (for example a recording stuck in `ending`), the clean-up fails at every run: the
recording stays in progress, cannot be deleted, and its room stays held.

## What Changes

- When stopping a stale recording process fails and the process is not `starting` or `active`, the clean-up ends the
  recording as `aborted`, reports it like any other end and releases the room.
- Specs: `recordings` gains the requirement "A refused stop does not keep a stale recording in progress".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: adds "A refused stop does not keep a stale recording in progress".

## Impact

- Webhooks and embedded API: a stuck recording now reports `recordingEnded` `aborted`. No contract change.
- Code: the stale-recordings clean-up in `meet-ce/backend`.
- REST API, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Final status of a recording whose stop was refused. Proposed: `aborted`, as for a process the media server forgot. Alternative: `failed`.

## Source

3.10.0 pre-release audit, finding RC-9 (low, static-plausible), introduced by #127.
