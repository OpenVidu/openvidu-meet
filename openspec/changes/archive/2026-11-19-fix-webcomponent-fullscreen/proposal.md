# Proposal

## Decisions

- The Fullscreen item of More options is shown in `<openvidu-meet>` as in the other modes, whatever the host page
  allows (user, 2026-11-19; the alternative was hiding it when the host page or its policy forbids fullscreen).
- The change also covers the standalone application and the iframe, where the menus and dialogs of a meeting in
  fullscreen stop being shown once a participant leaves (user, 2026-11-19).

## Why

In `<openvidu-meet>`, the Fullscreen item of More options does nothing. Where fullscreen would work, the
menus and dialogs would not be shown in it. In the standalone application and the iframe, they stop being
shown as soon as a participant leaves: every participant tile moves them out of the fullscreen stage when it
is removed.

## What Changes

- Fullscreen finds the meeting stage from the toolbar inside it, so it is found inside the element's shadow
  root too, and enters fullscreen on it.
- The overlay container follows the fullscreen element by itself, in every mode: it moves into it when
  fullscreen starts and returns when it ends, so menus, dialogs and notifications stay visible. No component
  moves it any more.
- No spec change: "Fullscreen" of `meeting-layout` already requires the toggle and visible menus, and
  fails today in the element and after a participant leaves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `meeting-layout` "Fullscreen" (scenario "Menu in
fullscreen").

## Impact

- Embedded API: webcomponent only; no contract change.
- Meeting UI: More options > Fullscreen and F11 work in the element; menus and dialogs stay visible in
  fullscreen in every mode.
- Not affected: REST API, webhooks, console UI, deployment configuration.
- Code: the document service, the toolbar, the stream tile, the device setup screen and the overlay container
  of `shared-meet-components`, the shadow overlay container of `meet-ce/frontend/webcomponent`.
- openvidu.io: none.

## Source

3.10.0 pre-release audit, finding EM-6 (low, verified-live), introduced by earlier releases; the participant
leaving case comes from the 2026-11-19 frontend audit.
