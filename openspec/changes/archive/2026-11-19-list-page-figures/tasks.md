# Tasks

## 0. Before starting

- [x] 0.1 Archive `align-unreleased-api-uniformity` first (or rebase on its archive), so the MODIFIED blocks of the recordings delta start from its text.

## 1. Typings

- [x] 1.1 Add to `meet-ce/typings/src` and export `MeetRoomsSummary` and `MeetRecordingsSummary` as `Pick`s of `MeetAnalytics`, and `MeetUsersSummary` with a TSDoc per member.
- [x] 1.2 `MeetRecordingFilters.status` becomes `MeetRecordingStatus | MeetRecordingStatus[]`, TSDoc: "One status, or several matched with OR (sent comma-separated)."

## 2. Backend: `recordingList` with several statuses

- [x] 2.1 The `recordingList` query schema accepts one status or a comma-separated list, deduplicated, `422` on an unknown value; the repository filters with `$in`.
- [x] 2.2 Document the list form of `status` in `openapi/recordings/parameters/recording-status.yaml`.
- [x] 2.3 Integration tests in the existing recordings list suite: several statuses, one unknown status in a list (`422`), one status as before.

## 3. Backend: summary endpoints

- [x] 3.1 Rooms and recordings repositories: extract the scope filter of `find` into one builder and add a scoped `$group` count by status; rooms also get the scoped expiring count and next expiring room. Users repository: a `$group` count by role.
- [x] 3.2 Services and controllers for `roomGetSummary`, `recordingGetSummary` and `userGetSummary`; the status to figure maps live in one place shared with `AnalyticsService`.
- [x] 3.3 Internal routes `GET /rooms/summary` and `GET /recordings/summary` (access token of any role, `apiLimiter` on the rooms route, then the list access middleware) and `GET /users/summary` (admin access token).
- [x] 3.4 Internal OpenAPI: the three paths and their schemas under `openapi/{rooms,recordings,users}/internal/`, referenced from `openvidu-meet-internal-api.yaml`.
- [x] 3.5 Integration tests in the existing rooms, recordings and users suites: the admin counts, the scoped counts of a `room_manager` and a `room_member`, `401` for an API key and a room member token, `403` for a non-admin on the users summary.

## 4. Frontend: figures component and list state

- [x] 4.1 `ListUrlState` keeps array values, comma-separated in the URL; one value keeps its current form. Unit tests.
- [x] 4.2 `ov-list-figures` in `shared/components/list-figures/`: tiles from 768 px (compact below 1200 px), summary card with chips below 768 px, selected state, toggle and "all" behavior, informational figure with a link. Unit tests for selection and toggling. Translations in every language file of the library.
- [x] 4.3 Summary services for rooms, recordings and users (internal API paths).

## 5. Frontend: the three pages

- [x] 5.1 Rooms page: the five figures, status filter on selection, expiring figure linking to the next room; read on open, on the Refresh button and after each successful action, not on a search or filter change.
- [x] 5.2 Recordings page and list: `statusFilter` becomes an array with a `multiple` select and a chip listing the statuses; the four figures; read on open, on the Refresh button and after each successful action, not on a search or filter change. The room detail Recordings tab and the room recordings page get the multiple status filter too, without figures.
- [x] 5.3 Users page: the four figures, role filter on selection; read on open, on the Refresh button and after each successful action, not on a search or filter change.
- [x] 5.4 No figures when the total is 0 or the read fails.
- [x] 5.5 E2E in the existing console list specs: selecting a figure filters and toggles off on rooms, the failed figure on recordings holds its three statuses, a role figure on users, and the phone layout on one page.

## 6. Release surfaces

- [x] 6.1 `CHANGELOG.md`, unreleased release: one line for the figures of the console lists and one for `recordingList` accepting several statuses.
- [x] 6.2 openvidu.io `docs/meet/features/rooms/management.md`: the figures in "List & filter rooms", screenshots recaptured.
- [x] 6.3 openvidu.io `docs/meet/features/recordings/management.md`: the figures and the multiple status filter, screenshots recaptured.
- [x] 6.4 openvidu.io `docs/meet/features/users/management.md`: the figures in "List & filter users", screenshots recaptured.
- [x] 6.5 Regenerate the REST API reference for the `status` parameter of `recordingList` with `./meet.sh build-rest-api-doc <main checkout>/../openvidu.io/docs/meet/embedded/reference/api.html`, passed as an absolute path (from a worktree, openvidu.io is not at `../openvidu.io`).
