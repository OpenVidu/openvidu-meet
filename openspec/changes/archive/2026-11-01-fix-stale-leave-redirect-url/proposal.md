# Proposal

## Why

The leave redirect is remembered beyond the entry that set it. An element on room A with
`leave-redirect-url` is removed and a new element on room B without it is added: Back on B's join screen
sends the host page to A's redirect. An iframe replaced by another without the parameter does the same,
because the tab's storage still holds the old URL.

## What Changes

- Each entry owns its leave redirect: an entry without `leave-redirect-url` has none, whatever an earlier
  entry set, in the same element, the same tab or after a remount.
- The value kept for the tab across reloads is stored with its room, as the room secret is, and applies
  only to that room.
- A new requirement states the rule; it also makes "A new element starts clean" and the scenario "Embedded
  element without a redirect" of `meeting-join` hold.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-join`: ADDED "A leave redirect belongs to its room entry".

## Impact

- Embedded API: `leave-redirect-url` in the element, the iframe and the direct link; no contract change.
- Meeting UI: Back and the dismiss buttons no longer navigate to a stale URL.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the leave redirect service of `shared-meet-components` and its call in the meeting entry service.
- openvidu.io: none.

## Decisions to confirm

- Whether the room-scoped storage applies to the standalone app too. Proposed: yes, one rule in every
  mode. Alternative: only the embedded modes, leaving the standalone tab's behavior as is.

## Source

3.10.0 pre-release audit, finding EM-8 (medium, verified-live), introduced by earlier releases (extended by #135).
