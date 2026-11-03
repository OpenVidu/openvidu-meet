# Proposal

## Why

On the device setup screen of `<openvidu-meet>`, the top toolbar covers the first 80 pixels of the host
page across its full width, outside the element's box, and swallows clicks on the host's header.

## What Changes

- The device setup toolbar is positioned inside the element's box, so nothing of the screen draws or
  captures clicks outside it.
- A new requirement states that the device setup screen stays within the element's box.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-distribution`: ADDED "The device setup screen stays within the element".

## Impact

- Embedded API: webcomponent only; no contract change.
- Meeting UI: the device setup toolbar layout inside the element; the standalone app looks the same.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the device setup component styles in `shared-meet-components`.
- openvidu.io: none.

## Decisions to confirm

- How to contain the toolbar. Decided: `position: absolute` inside the setup container. Alternative:
  `contain: layout` on the element's host, which also moves every overlay (dialogs need rechecking).

## Source

3.10.0 pre-release audit, finding EM-5 (medium, verified-live), introduced by earlier releases.
