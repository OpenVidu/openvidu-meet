# Proposal

## Why

The room secret and the encryption key taken from a URL are kept for the browser tab so a reload enters the same room again, but they are kept in one slot per tab, not per room. Any later entry without `secret` or `e2ee-key`, to any room, reuses them:

- A tab that entered room A with its speaker link and then opens room B's user access link (no `secret`) sends A's secret for B and lands on the "Invalid link" error screen instead of the login screen or B's join screen.
- An `<openvidu-meet>` whose `room-url` is switched to another room's link without `secret` picks up the secret of the first room. (Removing the element clears both, so a new element is not affected.)
- The encryption key of room A is offered on the join screen of room B.

The same applies to the recording screens, which share the stored secret.

## What Changes

- The secret and the encryption key are kept for the tab together with the room they were given for, and restored only when the same room is entered again without them.
- Entering another room without `secret` or `e2ee-key` starts with neither.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-join`: "Secret and encryption key are kept out of the address bar" states that they are kept per room and not reused for another room.

## Impact

- Meeting UI, recording screens: entries without `secret` or `e2ee-key` to another room in the same tab, or in the same element after its `room-url` changes, behave as a fresh entry.
- Embedded API, REST API, webhooks, console UI, deployment configuration: no contract change.
- Code: the session storage of the room secret and the encryption key, and the three entry services that restore them (meeting, recording, room recordings), in the `shared-meet-components` library. Browser session storage only: no server state, so the number of Meet replicas plays no part. A value stored by the previous version in the old shape is ignored once, on the first reload after the upgrade.
- openvidu.io: none. `docs/meet/features/meetings/e2e-encryption.md` and the access pages do not describe how the tab keeps them.

## Decisions to confirm

- One stored secret and key per tab, tagged with its room (proposed): enough for reloads, and the simplest change. Alternative: keep one per room for every room visited in the tab, so going back to an earlier room without `secret` in the same tab also restores its access.
