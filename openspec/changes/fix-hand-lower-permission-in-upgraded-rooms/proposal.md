# Proposal

## Why

After the upgrade to 3.10.0, the moderator role of every room created before it lacks `participantHandLower`, and the meeting gives the raised-hand sound and notice, Lower hand and Lower all hands only to holders of that permission. A moderator of an upgraded room sees hands go up on the tiles and in the panel but is never notified and cannot lower any; only admins and the owner can. The release notes do not say so, unlike the 3.9.0 entry of `participantMute`, which named the same limit.

## What Changes

- The raise hand entry of `CHANGELOG.md` says that `participantHandLower` is granted to the moderator role of rooms created from 3.10.0 on, as the 3.9.0 `participantMute` entry does. The permission defaults and the room migration stay as they are: no migration hands out a moderation capability.
- Depending on the decision below:
  - Option A: nothing else changes. The raised-hand notice keeps depending on `participantHandLower`, and the entry also says it gates the notice.
  - Option B: the raised-hand sound and notice also reach participants with the moderator role who lack `participantHandLower`; the notice offers Lower hand only to holders of the permission.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Under Option A the specs already state the behavior: `permissions` "Permissions missing from older data", scenario "Room from 3.9.0" (the upgraded moderator role denies `participantHandLower`), and `raise-hand` "Holders of participantHandLower are notified of raised hands". Under Option B, `raise-hand` "Holders of participantHandLower are notified of raised hands" is modified (task 1.2 adds the delta).

## Impact

- REST API, webhooks, embedded API, console UI, deployment configuration: no change; no public contract changes.
- Meeting UI: none under Option A. Under Option B, moderators without `participantHandLower` hear the sound and see the notice, without its Lower hand action.
- Code (Option B only): the raised-hand notice in `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/services/meeting-event-handler.service.ts`.
- Release notes: the raise hand entry of `CHANGELOG.md` under `## 3.10.0 (unreleased)`.
- openvidu.io: `docs/meet/features/meetings/raise-hand.md` already says that rooms and members created before the release start without `participantHandLower`; under Option B its notice paragraph changes.

## Decisions to confirm

- Open product question: should the raised-hand notice depend on `participantHandLower` at all, since a moderator who cannot lower hands still needs to know one is up? Option A: keep it gated on `participantHandLower` (today's spec); operators grant the permission to the moderator role of upgraded rooms. Option B: notify holders of `participantHandLower` and participants with the moderator role, offering Lower hand only with the permission.
- Where the release notes state it. Proposed: a clause in the raise hand entry under Added, as the 3.9.0 `participantMute` entry did. Alternative: an `Upgrade notes` line stating that rooms created before 3.10.0 keep a moderator role without `participantHandLower`.

## Source

3.10.0 pre-release audit, finding IM-1 (medium, static-high), introduced by #109.
