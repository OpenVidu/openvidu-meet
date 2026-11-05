# Tasks

## 1. Loading state

- [x] 1.1 Add `TableSkeletonComponent` (`shared-meet-components/src/lib/shared/components/table-skeleton`) with an accessible label and a reduced-motion rule.
- [x] 1.2 In the rooms, users, recordings and room members lists, show it instead of the spinner when `loading()` and there are no rows, dim the table and the recordings cards (`is-loading`, shared `%ov-table-container`) while `loading()` with rows, and drop the unused spinner import and `.loading-container` styles.
- [x] 1.3 Translate the Duration and Size headers of the recordings list with the existing `RECORDINGS.COMMON` keys.
- [x] 1.4 Lint, the unit suite and a production build of the frontend pass.

## 2. Release surfaces

- [x] 2.1 Add the `Improved` > `UI` line and the `Fixed` > `UI` line to `CHANGELOG.md` under the unreleased 3.10.0.
- [x] 2.2 openvidu.io: none.

## Workflow follow-up

- Archive the change inside the pull request and run `npx openspec validate --all --strict`.
