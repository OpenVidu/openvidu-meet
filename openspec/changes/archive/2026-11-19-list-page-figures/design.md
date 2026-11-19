# Design

## Context

The console lists load through the public `roomList`, `recordingList` and `userList`. Their caller scope is set by
`applyRoomListAccessFilters` and `applyRecordingListAccessFilters`, which fill the scope fields of the query
(`owner`/`member`/`userAccess`, `roomOwner`/`roomMember`/`roomUserAccess`) before the repositories build their filter.
`analyticsGet` counts the whole deployment through `countByStatus`, `countExpiringRooms` and `findNextExpiringRoom`,
with no scope. The pages hold their state in `EntityListState` and `ListUrlState`; `ListUrlState` handles scalar values
only. A delete removes rows locally (`list.remove`) instead of reloading the list.

## Goals / Non-Goals

**Goals:**

- One scope rule per domain: the summary counts exactly what the list returns, because both use the same access
  middleware and the same filter builder.
- One figures component in `shared-meet-components` that the three pages configure.

**Non-Goals:**

- Changing `analyticsGet` or the overview. Reusing the new scoped counters from `AnalyticsService` (empty scope) is
  allowed when it removes code, not required.
- Caching the figures: every reading counts in MongoDB.

## Decisions

### Backend: scoped counters behind the list middleware

- Each repository extracts the scope part of its `find` filter into one private builder, used by `find` and by a new
  `countByStatusInScope(scope)` that runs one `$group` by `status` over the scoped filter. `RoomRepository` adds the
  expiring count and the next expiring room under the same scope. `UserRepository` adds a `$group` by `role`.
- Routes, on the existing internal routers. Like `analyticsGet`, the summary endpoints accept access tokens only, so
  `withAuth` answers `401` to an API key, a room member token or no credential. `GET /rooms/summary` and
  `GET /recordings/summary` use `withAuth(accessTokenValidator(ADMIN, ROOM_MANAGER, ROOM_MEMBER))` and then the list
  access middleware, which starts from an empty query when no validator set one, so a non-admin gets the default scope
  of the list and an admin none. `GET /rooms/summary` adds `apiLimiter` on the route, since
  `internalRoomRouter` has no router-wide limiter. `GET /users/summary` uses `accessTokenValidator(ADMIN)`. No route
  takes query parameters.
- Responses, as typings in `meet-ce/typings/src` (internal, so not part of the embedded or public API surface):
  `MeetRoomsSummary = Pick<MeetAnalytics, 'totalRooms' | 'openRooms' | 'activeRooms' | 'closedRooms' |
'roomsExpiringSoon' | 'nextExpiringRoom'>`, `MeetRecordingsSummary = Pick<MeetAnalytics, 'totalRecordings' |
'recordingsInProgress' | 'completeRecordings' | 'failedRecordings'>`, and a new `MeetUsersSummary` `{ totalUsers,
adminUsers, roomManagerUsers, roomMemberUsers }`. The status to figure maps of `AnalyticsService` move next to the summaries so both use one copy.
- `recordingList` `status`: the zod schema accepts one status or a comma-separated list (deduplicated, each value
  validated against `MeetRecordingStatus`, `422` on an unknown one); the repository filters with `$in`. The OpenAPI
  parameter documents the list form; the single form is unchanged.

Alternative rejected: counting in the list endpoints (`roomList` returning totals) would add a count to every page of
a public endpoint (the user chose 1a).

### Frontend: one figures component, configured per page

- `ov-list-figures` in `shared/components/list-figures/`: inputs are the figures (`key`, label, count, color, icon,
  optional filter value, optional detail and link) and the selected key; output `figureSelect` with the figure's
  filter or `null` for "all". It renders tiles from 768 px (compact below 1200 px through CSS) and the summary card
  below 768 px, switching on the existing `ViewportService.isMobileView`. Tokens and the status colors of the
  overview are reused; no new design tokens.
- Each page fetches its summary on `initialize`, on the Refresh button, and after each action that succeeds
  (create, delete, bulk delete, status change, role change); not on a search or filter change, which also runs
  `list.refresh`. A failed read clears the figures and logs; the list is
  not affected. A total of 0 hides the component.
- The selected figure derives from the page's current filter: rooms `statusFilter`, recordings `statusFilter`
  (now an array), users `roleFilter`. Selecting a figure writes that filter through the list component, so the URL,
  the chips and the panel update the way they do today.
- Recordings: `statusFilter` becomes `MeetRecordingStatus[]`, the panel select becomes `multiple`, and the active
  filter chip lists the chosen statuses. `ListUrlState` learns array values, serialized comma-separated in the URL as
  the API takes them; a URL with one status keeps working.

### Replicas

Read-only counts on the shared MongoDB, no state in process memory, no coordination: any replica answers.

## Risks / Trade-offs

- [Each summary read adds 2 to 4 count queries] → `status` and `role` are indexed; the scope
  filters are the list's own, already served by its indexes.
- [The figures and the list are two requests and can disagree for a moment] → both are re-read on open, Refresh and
  actions; the next one aligns them.
- [`ListUrlState` array support touches the three lists] → the change is additive; existing scalar params keep their
  serialization, covered by its unit tests.
