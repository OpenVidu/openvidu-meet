# Proposal

## Why

On the console Rooms, Recordings and Users lists the whole row opens the item, so a click meant to select text, focus a
row or reach for a control opens a page by accident, and an item cannot be opened in a new tab. The OpenVidu dashboard
opens an item from its id, which is a real link.

## What Changes

- On the Rooms, Recordings and Users lists a row no longer opens anything: the id of the room, the recording or the user
  is a link to its detail page, so it opens in the same tab on click and in a new tab with the browser's own controls.
  On the Users list the signed-in user's id opens their profile.
- The Recordings list shows the recording id on every list, in a column of its own, and in the cards of the phone layout
  for every list; it was shown only where the room is.
- The Room Members list has no row action to remove: its rows already opened nothing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: a new requirement, "Console lists open an item from its id".

## Impact

- Console UI: the Rooms, Recordings, Users and room detail pages. No contract change.
- Code: the four list components of `shared-meet-components` lose their `roomClicked`, `recordingClicked`, `userClicked` and
  `memberClicked` outputs, the pages their handlers and four error messages in every locale.
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: none, no page describes opening an item from a row.

## Decisions to confirm

- None.
