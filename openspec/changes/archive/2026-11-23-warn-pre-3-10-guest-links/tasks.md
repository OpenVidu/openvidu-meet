# Tasks

No typings, backend or OpenAPI work: the change reads the `accessUrl` and `memberId` the console already receives.

## 1. Console mark on guest links issued before 3.10.0

- [x] 1.1 Add to `RoomMemberUiUtils` (`room-members/utils/ui.ts`) the helper that is true for an identified guest whose `accessUrl` `secret` equals its `memberId` and false otherwise (design, Approach); verified by the test of 1.4, which fails without it
- [x] 1.2 Show the `warning` icon with its tooltip and accessible label next to the member's name in `room-members-list.component.html` when the helper is true, styled with `var(--ov-meet-color-warning)` in `room-members-list.component.scss`; verified by the test of 1.4
- [x] 1.3 Add `ROOM_MEMBERS.LIST.DEPRECATED_ACCESS_LINK` with the tooltip text of the proposal's assumptions to every locale file of `room-members/lang/`; verify each locale file carries the key
- [x] 1.4 Add to `meet-ce/frontend/e2e/console/room-detail.test.ts` the test of the design (members list intercepted with `page.route`, one guest rewritten to a link of the old form) covering the scenarios "Guest added by 3.9" and "Links of the current form" of the `room-members` delta (an identified guest of the old form, one of the current form and a user member); verify it passes headless through `test-runner`, or report it as not run when `./meet.sh doctor` says the local deployment is unusable

## 2. Release surfaces

- [x] 2.1 Reword the `Deprecated` line of 3.10.0 in `CHANGELOG.md` about the `accessUrl` of identified guests added before 3.10.0, following `.claude/rules/changelog.md`: in 3.13.0 those guests get a link of the current form with the same `memberId` and the old link stops working, adding a guest again replaces it sooner, and the console's Room Members tab marks them. No line of its own (proposal, Impact); verify the 3.10.0 section has a single entry about these links
- [x] 2.2 Update the "Identified guests added before 3.10.0" note of openvidu.io `docs/meet/features/room-members/management.md` on `next` (the checkout at `<main checkout>/../openvidu.io`, edited in place without a worktree): the Room Members tab marks those guests with a warning icon, and 3.13.0 gives them a link of the current form with the same member ID while the old link stops working; verify the page renders the note

## Workflow follow-up

- `./meet.sh verify`, then `refactorer`, then the tests `./meet.sh affected` lists, then `change-reviewer`, as the root `CLAUDE.md` orders them for a `spec` change.
- `/opsx:archive` inside the same pull request, before merging, and `./meet.sh verify --only openspec --all` afterwards.
- In 3.13.0: propose `replace-pre-3-10-guest-links` from the design's "What 3.13.0 does".
