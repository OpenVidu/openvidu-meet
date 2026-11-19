# Proposal

## Decisions

- A middle click on a console list row opens the item in a new tab, as a link does: the user's request, 2026-11-19.
- The spec states it: the user, 2026-11-19 ("the spec must always be in sync with the product").

## Why

On the console Rooms, Recordings and Users lists a row opens its item on a click and in a new tab on a Ctrl or Cmd
click, but a middle click on the row does nothing, while a middle click on a link opens a new tab.

## What Changes

- A middle click on a row of the Rooms, Recordings and Users lists opens the item's page in a new tab, unless it lands
  on a link, a button or a selection checkbox, which keep their own middle click. The browser's middle-click
  autoscroll no longer starts on a row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: "Console lists open an item from its row" names the middle click and gains a scenario for it.

## Impact

- Console UI: the Rooms, Recordings and Users lists. No contract change.
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: none, no page describes opening an item from a row.

## Assumptions

- None.
