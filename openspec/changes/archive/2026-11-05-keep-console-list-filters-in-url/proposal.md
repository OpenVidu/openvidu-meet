# Proposal

## Why

The console Rooms, Users and Recordings lists keep their search, filters and order only in memory, and restore them
only when the browser's back button is used. A reload loses them, a link to a filtered list cannot be shared, and the
list the user comes back to is a copy of the old one rather than the current data.

## What Changes

- The search text, its match mode, the filters and the sort field and order of the Rooms, Users and Recordings lists
  are kept in the page's URL (`?q=ana&status=open&sort=roomName&order=asc`). Opening, reloading or sharing the URL shows
  the same list, and the browser's back and forward buttons step through the searches. A field at its default is left
  out, a value the list does not accept is ignored, and opening the page without a query string shows the default list.
- The room detail page keeps its selected tab in the URL (`?tab=members`).
- Coming back to a list loads it again from the server, so it shows the current data. The pages beyond the first one a
  user had loaded and the scroll position are no longer restored.
- The in-memory list state cache is removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: a new requirement, "Console lists keep their search and filters in the URL".

## Impact

- Console UI: the Rooms, Users, Recordings and room detail pages. No contract change.
- Code: `ListStateCacheService`, `ScrollPersistDirective`, the snapshot and restore of `EntityListState` and the
  navigation helpers that invalidated the cache are removed; a `ListUrlState` class and a defaults and URL parameter map per list replace
  them, and the list components re-apply their filters when the page changes them.
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: none, no page describes how the lists remember their filters.

## Decisions to confirm

- None.
