# Tasks

Prerequisite of `add-waiting-room` (it replaces that change's task group 1). Two pull requests: group 1, then groups 2 and 3, archived in the second.

## 1. Renames (first pull request, names only)

- [x] 1.1 Rename as design D1 lists: `MeetingLobbyComponent` → `MeetingJoinComponent` (`ov-meeting-join`), `MeetingLobbyService` → `MeetingJoinService`, `meeting-lobby` folders and files → `meeting-join`, `LOBBY.*` → `JOIN.*` in every locale of the meeting domain, and remove `MeetingWaitingPanelComponent` with its barrel export and its `ng-content` slot in `meeting.component.html` as D1 says (optional link in `ShareRoomAccessLinkComponent`, `#invite-without-link` and `#invite-overlay`, keys `INVITE_WITHOUT_LINK.*`)
- [x] 1.2 Rename the `lobby` test ids and the helper names that mention it in `meet-ce/frontend/e2e/`, `meet-ce/frontend/webcomponent/tests/` and `testapp/src/`, and the `#waiting-panel`, `#waiting-overlay` and `#share-link-overlay` selectors; remove the projected panel from `meet-pro/frontend/src/app/customization/pages/app-pro-meeting/app-pro-meeting.component.ts` when `meet-pro/` is present
- [ ] 1.3 Verify: `grep -rni "lobby" meet-ce/frontend/projects meet-ce/frontend/e2e meet-ce/frontend/webcomponent testapp/src` finds nothing but comments about the waiting room; `./meet.sh test-unit-frontend`, `./meet.sh lint-frontend`, `./meet.sh lint-webcomponent` and the library build (`npx ng build shared-meet-components --configuration production` from `meet-ce/frontend`, not `pnpm run`, which rewrites the lockfile) pass; the SPA end-to-end specs `access`, `e2ee`, `meeting-start`, `permissions`, `share-link`, `room-wizard` and the web component specs `attributes`, `room`, `identified-guest-state` pass against an isolated backend (report them as not run when none is available)

## 2. Structure (second pull request)

- [ ] 2.1 Add `roomMemberTokenFailure` (design D4) with a Karma spec over every status and message fragment; make `RoomAccessService.validateAccess` and the join token request call it, removing both `switch` blocks
- [ ] 2.2 Move the join token request into `JoinTokenService` (design D3), moving its cases from `meeting-lobby.service.spec.ts` (now `meeting-join.service.spec.ts`) into `join-token.service.spec.ts`; `MeetingJoinService` keeps the view model and exposes `joinRequest()`
- [ ] 2.3 Add `MeetingEntryFlowService` and `joinScreenNeeded` (design D2): `MeetingComponent` switches on `step()`, binds `[prejoin]` to `options().showDeviceSetup`, and loses `showLobby`, `lobbyState` and `isMeetingLeft`; the room config loads in the flow's transition to `meeting`. Karma specs: `joinScreenNeeded` for each option value and each reason the screen must show; the flow's transitions, including that the room config is requested before the step becomes `meeting` and that a failed load still proceeds
- [ ] 2.4 Add `readMeetingEntryParams` (design D5) with a Karma spec showing the same params from query strings and from element values, tri-state booleans included; use it in `extractRoomMeetingParamsGuard` and `wcRouteFromAttributes`, type `MeetingRoute.params` as `MeetingEntryParams`, and trim `extractParams`; move the affected cases of `url.utils.spec.ts` and `wc-route.utils.spec.ts`
- [ ] 2.5 Add `MeetingPhaseService.isPreviewing` (design D6) and use it in the embedded command gate; keep the `embedded-command.service.spec.ts` cases for device commands before joining passing
- [ ] 2.6 Verify as 1.3, plus `rtk proxy npx prettier --check` on the changed files; the diff adds no behavior and removes more lines than it adds outside the specs

## 3. Workflow

- [x] 3.1 `add-waiting-room`: its task 1.1, its proposal and its design point to this change
- [ ] 3.2 No `CHANGELOG.md` line and no openvidu.io page (refactor). `npx openspec validate refactor-meeting-entry-flow --strict`, then `/opsx:archive refactor-meeting-entry-flow` in the second pull request, before merging
