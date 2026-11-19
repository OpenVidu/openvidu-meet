# Proposal

## Decisions

- Key figures sit above the console Rooms, Recordings and Users tables as tiles that filter the table, the shape of
  option A of the design canvas: the user, 2026-11-19.
- The tiles adapt to the width: compact tiles on tablets and, on phones, one summary card with a chip per figure that
  filters the same way: the user, 2026-11-19.
- Each user sees figures counted over what they can see on that page, never deployment totals they cannot list: the
  user, 2026-11-19.
- The figures come from one internal endpoint per domain that counts with the same scope as its list; `analyticsGet`
  and the overview are unchanged (round 1, 1a): the user, 2026-11-19.
- The figures count everything the user can see on the page, whatever the search text and the other filters say
  (round 1, 2a): the user, 2026-11-19.
- `recordingList` `status` accepts several statuses, so a tile that groups statuses filters exactly what it counts
  (round 1, 3a), written as a comma-separated list (round 2, 8a): the user, 2026-11-19.
- The status filter of the console Recordings page becomes a multiple choice over the seven statuses, and selecting a
  tile selects its group in it (round 2, 9a): the user, 2026-11-19.
- The "expiring in 7 days" figure of the Rooms page is informational: it does not filter and links to the next room
  to expire (round 1, 4a): the user, 2026-11-19.
- The figures are read again whenever the list is (opening the page, Refresh, after an action that changes the list),
  with no periodic refresh (round 1, 5a): the user, 2026-11-19.
- With no item to count, or when reading the figures fails, no figure is shown and the list works as before
  (round 1, 6a): the user, 2026-11-19.
- One change for the three pages (round 1, 7a); the Recordings tab of a room's detail page gets no figures
  (round 2, 10a): the user, 2026-11-19.
- The status filter is a multiple choice on every page that shows it: the console Recordings page, the Recordings
  tab of a room's detail page and the room recordings page `/room/{roomId}/recordings` (round 3, 11a): the user,
  2026-11-19.
- The internal API (`/internal-api/v1`) carries no compatibility promise: the user, 2026-11-19, as
  `openspec/config.yaml` already states.

## Why

The console Rooms, Recordings and Users pages open straight on a table: to know how many rooms are in a meeting or how
many recordings failed, a user has to filter and count by hand. The overview answers that for administrators only,
and only for the whole deployment. Showing the key figures of each page above its table, and letting them filter it,
makes the pages quicker to read and act on, for every role that opens them.

## What Changes

- Rooms page: figures for all rooms, in a meeting now, open, closed and expiring in 7 days, counted over the rooms the
  user can see. All but the expiring one filter the table by status; the expiring one names the next room to expire
  and links to it.
- Recordings page: figures for all recordings, in progress (`starting`, `active`, `ending`), complete and failed
  (`failed`, `aborted`, `limit_reached`), counted over the recordings the user can list, each filtering the table by
  its statuses. The status filter becomes a multiple choice there and on the two room-level recordings pages.
- Users page (admins only): figures for all users, admins, room managers and room members, each filtering the table by
  role.
- Shared behavior of the three pages: selecting a selected figure again clears its filter; the selection is the
  page's filter, so it is kept in the URL like the others; the figures follow the width of the screen; they stay out
  of the page when there is nothing to count or when they cannot be read.
- REST API: `recordingList` accepts several statuses in `status`, comma-separated. One status keeps working as
  today.
- Internal API: three new endpoints return the figures of each page to the console.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: a new requirement for the figures shared by the console lists (selection, URL, refresh, width, empty and
  failure).
- `rooms`: a new requirement for the figures of the console Rooms page and the internal endpoint behind them.
- `recordings`: "Recording list filtering, sorting and pagination" accepts several statuses; "Console recordings page"
  and "Room recordings page" filter by several statuses; a new requirement for the figures of the console Recordings page and their endpoint.
- `users`: a new requirement for the figures of the console Users page and their endpoint.

## Impact

- REST API: `recordingList` `status` grows additively (one value or a comma-separated list). No other public
  contract changes.
- Internal API: three new read-only endpoints for the console (rooms, recordings and users figures).
- Console UI: the Rooms, Recordings and Users pages; the status filter of the Recordings page, of the room detail Recordings tab and of the room recordings page.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected. The overview and `analyticsGet` are not
  affected.
- Persisted data: none. No migration.
- PRO: the figures are a library component the three pages compose, so a PRO page can reuse or replace it.
- openvidu.io: `docs/meet/features/rooms/management.md`, `docs/meet/features/recordings/management.md` and
  `docs/meet/features/users/management.md` (the list sections and their screenshots), and the REST API reference
  regenerated for the `status` parameter of `recordingList`.

## Assumptions

- Breakpoints: full tiles from 1200 px, compact tiles from 768 px, the summary card below 768 px, the width under
  which the app already treats the screen as mobile.
- Labels: "All rooms", "In a meeting now", "Open", "Closed", "Expiring in 7 days"; "All recordings", "In progress",
  "Complete", "Failed"; "All users", "Admins", "Room managers", "Room members". Each tile shows its share of the total
  as a bar, with the colors the overview uses for the same statuses.
- The 7-day window of the expiring figure is the one of the overview.
