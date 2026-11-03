# Proposal

## Why

The meeting toolbar turns compact only in a window narrower than 768 px, but with the default buttons (raise hand,
reactions, copy link) it needs about 980 px, so between 768 and about 970 px the chat and participants buttons fall off
the screen (an iPad in portrait is 810 to 834 px). Inside a narrow `<openvidu-meet>` element the toolbar never turns
compact because it follows the window, not the meeting's own width.

## What Changes

- The toolbar turns compact when its buttons do not fit the width of the meeting, measured, instead of under a fixed
  768 px window width; this covers any window, the embedded element, longer room names and future buttons.
- Specs: `meeting-layout` "Toolbar across screen sizes" changes from the width constant to fit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-layout`: "Toolbar across screen sizes".

## Impact

- Meeting UI and embedded element: the toolbar. No contract change.
- Code: the toolbar media buttons component and the viewport service of `shared-meet-components`, replacing the width constant with a measurement (the status rail already decides its second row this way).
- REST API, webhooks, embedded API attributes, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- Whether the sidenav, rail and notice breakpoint (790 px) should also follow measurement. Decided: no, only the toolbar here. Alternative: align all breakpoints in this change.

## Source

3.10.0 pre-release audit, finding UI-8 (medium, verified-live), introduced by #103.
