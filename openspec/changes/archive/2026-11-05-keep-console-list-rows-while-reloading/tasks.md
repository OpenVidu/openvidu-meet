# Tasks

## 1. Loading state

- [x] 1.1 Add `SkeletonRowsComponent` (`shared-meet-components/src/lib/shared/components/skeleton-rows`) with an accessible label, a reduced-motion rule and the `plain` and `delayed` options.
- [x] 1.2 In the rooms, users, recordings and room members lists, show it instead of the spinner when `loading()` and there are no rows, dim the table and the recordings cards (`is-loading`, shared `%ov-table-container`) while `loading()` with rows, and drop the unused spinner import and `.loading-container` styles.
- [x] 1.3 Replace the loading screen of the Embedded page with the sections and placeholder rows, and drop the unused `EMBEDDED.LOADING_SUBTITLE` text from every locale.
- [x] 1.4 Translate the Duration and Size headers of the recordings list with the existing `RECORDINGS.COMMON` keys.
- [x] 1.5 Lint, the unit suite and a production build of the frontend pass.

## 2. Release surfaces

- [x] 2.1 Add the `Improved` > `UI` line and the `Fixed` > `UI` line to `CHANGELOG.md` under the unreleased 3.10.0.
- [x] 2.2 openvidu.io: none.

## Workflow follow-up

- Archive the change inside the pull request and run `npx openspec validate --all --strict`.
