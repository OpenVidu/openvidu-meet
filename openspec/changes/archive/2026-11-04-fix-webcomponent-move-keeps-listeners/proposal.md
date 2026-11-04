# Proposal

## Why

When the full bundle is imported directly, moving `<openvidu-meet>` to another container keeps the meeting
but silently drops every callback the host registered with `on()` and `once()`. The host stops receiving
events such as `embeddedCloseRequested` after the move.

## What Changes

- Removing the element no longer clears its `on()` and `once()` callbacks, so a move keeps them. They live
  on the element, so nothing leaks when the element is dropped.
- The unit test that locks in the clearing is inverted.
- No spec change: "Moving the element keeps the meeting" already says listeners SHALL be kept
  (scenario "Element moved during a meeting").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `embedded-distribution` "Moving the element
keeps the meeting".

## Impact

- Embedded API: `on()` and `once()` callbacks survive a DOM move; no contract change.
- Not affected: REST API, webhooks, meeting UI, console UI, deployment configuration.
- Code: the element wrapper in `meet-ce/frontend/webcomponent` (delete `disconnectedCallback`).
- openvidu.io: none.

## Decisions to confirm

- A removed element that is never re-inserted keeps its callbacks until it is garbage collected.
  Proposed: accept it. Alternative: clear them after the 10 ms move window if the element is still
  disconnected.

## Source

3.10.0 pre-release audit, finding EM-7 (low, verified-live), introduced by earlier releases.
