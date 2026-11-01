# Proposal

## Why

In `<openvidu-meet>`, the Fullscreen item of More options does nothing. Where fullscreen would work, the
menus and dialogs would not be shown in it.

## What Changes

- Fullscreen finds the meeting stage inside the element's shadow root and enters fullscreen on it.
- The overlay container of the element moves into the fullscreen element while in fullscreen, so menus,
  dialogs and notifications stay visible, and returns afterwards.
- No spec change: "Fullscreen" of `meeting-layout` already requires the toggle and visible menus, and
  fails today in the element.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `meeting-layout` "Fullscreen" (scenario "Menu in
fullscreen").

## Impact

- Embedded API: webcomponent only; no contract change.
- Meeting UI: More options > Fullscreen and F11 work in the element.
- Not affected: REST API, webhooks, console UI, deployment configuration, iframe and standalone behavior.
- Code: the document service and toolbar of `shared-meet-components`, the shadow overlay container of
  `meet-ce/frontend/webcomponent`.
- openvidu.io: none.

## Decisions to confirm

- Whether the Fullscreen item is shown in the element at all. Proposed: yes, as in the other modes.
  Alternative: hide it in the element when the host page's iframe or policy forbids fullscreen.

## Source

3.10.0 pre-release audit, finding EM-6 (low, verified-live), introduced by earlier releases.
