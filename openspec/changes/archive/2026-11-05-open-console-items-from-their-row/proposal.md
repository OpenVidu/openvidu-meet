# Proposal

## Why

On the console Rooms, Recordings and Users lists a click that ends a text selection, such as copying a room name, opens
the item's page, and an item cannot be opened in a new tab from its row.

## What Changes

- A click on a row of the Rooms, Recordings and Users lists opens the item's page unless it ends a text selection or
  lands on a link, a button or a selection checkbox; with Ctrl or Cmd it opens a new tab. The row shows a pointer cursor.
- The ids of rooms and users are links to their pages; the signed-in user's id opens their profile. On the Recordings
  list the room id links to the room, shown for every row because the list holds only recordings of rooms the user may
  read.
- The Room Members list has no row action to remove: its rows already opened nothing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: a new requirement, "Console lists open an item from its row".

## Impact

- Console UI: the Rooms, Recordings, Users and room detail pages. No contract change.
- Code: one `RowLinkDirective` in `shared-meet-components` replaces the four `*Clicked` outputs of the list components
  and the `$event.stopPropagation()` calls that guarded them; the pages lose their handlers and four error messages in
  every locale.
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: none, no page describes opening an item from a row.

## Decisions to confirm

- None.
