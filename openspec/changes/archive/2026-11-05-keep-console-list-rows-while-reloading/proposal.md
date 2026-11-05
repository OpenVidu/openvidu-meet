# Proposal

## Why

Every search, sort, refresh or "load more" on a console list replaces the whole table with a spinner once the server
takes longer than a moment, so the rows disappear and come back and the page jumps. The Duration and Size headers of
the recordings list are also shown in English whatever the language.

## What Changes

- A console list that reloads keeps its rows on screen, dimmed and not clickable, until the new ones arrive. When it has
  no rows yet, it shows placeholder rows of the size of the real ones instead of a spinner.
- The Duration and Size headers of the recordings list are translated.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: a new requirement, "Console lists keep their rows while they reload".

## Impact

- Console UI: the Rooms, Users, Recordings and room members lists. No contract change.
- Code: a `TableSkeletonComponent` in `shared-meet-components`, one template condition and one class per list.
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- None.
