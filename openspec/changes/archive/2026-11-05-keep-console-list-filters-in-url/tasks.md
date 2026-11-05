# Tasks

## 1. URL state

- [x] 1.1 Add `ListUrlState` (`shared-meet-components/src/lib/shared/models/list-url-state.ts`) with a unit spec: it reads the filters from the query string, writes only the fields that differ from the defaults, ignores values a field does not accept and reports later URL changes.
- [x] 1.2 Give the Rooms, Users and Recordings lists a defaults object and a URL parameter map next to their filter type, let the list components re-apply `initialFilters` when the page changes it, and make the pages write the filters to the URL on `filterChange` and reload on every URL change.
- [x] 1.3 Keep the room detail tab in the URL.

## 2. Remove the cache

- [x] 2.1 Remove `ListStateCacheService`, `ScrollPersistDirective`, the snapshot and restore of `EntityListState`, `isPopStateNavigation`, `navigateToAndInvalidate`, `invalidateCachedRoute` and `clearCachedRoutes`, and update their callers and specs.
- [x] 2.2 Lint, the unit suite and a production build of the frontend pass.

## 3. Release surfaces

- [x] 3.1 Add one line to `CHANGELOG.md` under the unreleased 3.10.0, `Improved` > `UI`.
- [x] 3.2 openvidu.io: none.

## Workflow follow-up

- Archive the change inside the pull request and run `npx openspec validate --all --strict`.
