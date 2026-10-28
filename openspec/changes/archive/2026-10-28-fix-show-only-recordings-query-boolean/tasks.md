# Tasks

## 1. Boolean parsing of the query parameter

- [x] 1.1 Read `show-only-recordings` from the room URL query parameters with the same tri-state boolean parsing used for `initial-audio-active` and `show-language-selector`, dropping the `|| 'false'` default and the `=== 'true'` comparison; verify with new cases in `shared/utils/url.utils.spec.ts` (absent, empty, `1`, `true`, `false`) run by `./meet.sh test-unit-frontend`.
- [x] 1.2 Cover the redirect in `domains/meeting/services/meeting-entry.service.spec.ts`: an entry with `showOnlyRecordings` read from an empty parameter redirects to `/room/<roomId>/recordings`; verify with `./meet.sh test-unit-frontend`.
- [x] 1.3 Add an iframe case to the existing recordings e2e coverage (`meet-ce/frontend/webcomponent/tests/e2e/attributes.test.ts`, next to the existing `show-only-recordings` tests, with `integration: 'iframe'`) loading `?show-only-recordings` with no value and with `=1`, expecting the room recordings page; run with `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.
- [x] 1.4 Embedded API surfaces: no attribute, command or event is added, renamed or removed, so the embedded API contract test (`meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts`), the testapp controls and the generated reference need no update; verify the contract test still passes with `./meet.sh test-unit-backend`.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "A room URL opened in an iframe or a direct link with `show-only-recordings` and no value, or a value other than `true` such as `1`, showed the meeting. It now shows the room recordings page unless the value is `false`, as the attribute of `<openvidu-meet>` does."
- [x] 2.2 openvidu.io: none. The attribute reference already states the boolean rule and the embedded API reference does not change, so nothing is regenerated.
