# Tasks

## 1. Dedicated error screen

- [ ] 1.1 Add the navigation error reason `invalid-participant-data` and its `NAVIGATION_ERROR.INVALID_PARTICIPANT_DATA.{TITLE,MESSAGE}` keys to the shared translation bundle in all 10 locales (`shared/lang/`), mapped in `shared/utils/navigation-error.util.ts`; verify that every locale file has the two keys and that `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend` stay green.
- [ ] 1.2 In `MeetingLobbyService.generateJoinToken()` (`domains/meeting/services/meeting-lobby.service.ts`), map `422` to that reason and log the server's message with `console.error` before redirecting; verify with a case in `domains/meeting/services/meeting-lobby.service.spec.ts` run by `./meet.sh test-unit-frontend`.
- [ ] 1.3 Add the scenario "External id with a space" next to the correlation field tests of `meet-ce/frontend/webcomponent/tests/e2e/events.test.ts`, on the webcomponent and iframe transports, expecting the new error screen; run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "A join refused because `participant-external-id` or `participant-metadata` exceed their limits showed the generic error screen. It now shows an \"Invalid participant data\" error screen and logs the server's reason in the browser console."
- [ ] 2.2 openvidu.io: none. No page lists the error screens, and the embedded API reference does not change, so nothing is regenerated.
