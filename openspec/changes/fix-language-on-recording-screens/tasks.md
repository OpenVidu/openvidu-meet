# Tasks

## 1. Language on every entry

- [x] 1.1 Webcomponent: apply `language` and `show-language-selector` in an effect of `webcomponent/src/app/app.ts` on the two inputs, so every screen follows them and only a change of either changes the language; drop both from the meeting route (`domains/embedded/models/wc-route.model.ts`, `wcRouteFromAttributes`) and from `MeetingEntryService` (see design.md). Verify with `domains/embedded/utils/wc-route.utils.spec.ts` and `meeting-entry.service.spec.ts` updated, run by `./meet.sh test-unit-frontend`.
- [x] 1.2 Iframe and direct link: a guard, `shared/guards/apply-requested-language.guard.ts`, first in the meeting, room recordings and recording routes, applies `language` and `show-language-selector` only when the URL carries them, so the app's own navigations keep what the page was opened with. Verify through the e2e scenarios of 1.3; `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend` stay green.
- [x] 1.3 Add the scenarios of the delta spec to the `language` tests of `meet-ce/frontend/webcomponent/tests/e2e/attributes.test.ts` (webcomponent and iframe transports); run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.
- [x] 1.4 Update the TSDoc of `EmbeddedAttribute.LANGUAGE` and `WebComponentPropertyValues.language` in `meet-ce/typings/src/embedded/attributes.ts` to say it also applies to recording screens; no command or event list changes, so the embedded API contract test needs no update, and the testapp already appends `language` to a recording URL on both transports (`testapp/src/app/app.ts`, `buildIframeSrc`), so its controls need none either (verify `meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts` still passes with `./meet.sh test-unit-backend`).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no `Fixed` line, because `language` is new in 3.10.0 itself. Reword its existing `Added` -> `Integration` entry from "sets the initial meeting language" to "sets the initial interface language, meeting and recording screens alike," so it states what ships.
- [ ] 2.2 After rebasing the branch on `main` (its typings lag `main`, so generating now would revert newer TSDoc on the site): openvidu.io `next`: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` (the `language` row of `shared/meet/webcomponent/attributes.md` changes); verify with the `check-web` skill.
