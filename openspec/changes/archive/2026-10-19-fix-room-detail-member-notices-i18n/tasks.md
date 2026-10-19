# Tasks

## 1. Translate the room detail notices

- [x] 1.1 Add keys for the member link copy, the single and bulk member removal results (with the removed and failed counts as parameters) and the members and recordings loading failures to every locale of `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/room-members/lang/` and `.../rooms/lang/`, and use them through `TranslateService` in `room-detail.component.ts`; verify `./meet.sh lint-frontend` and `./meet.sh test-unit-frontend` pass and that no `showMessage('` or `` showMessage(` `` literal is left in that component.
- [x] 1.2 Add to `meet-ce/frontend/e2e/console.test.ts` a check that, with the console in Spanish, copying a member's access link on the room detail page shows the Spanish notice; run `./meet.sh test-e2e-frontend` (needs the local deployment; report it as not run otherwise).

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "The notices of the console room detail page about copying a member's link, removing members and failing to load members or recordings were always in English. They now follow the selected language."
- [x] 2.2 openvidu.io: none.
