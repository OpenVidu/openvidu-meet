# Tasks

## 1. Language on every entry

- [ ] 1.1 Carry `language` in the webcomponent `SINGLE_RECORDING` and `ROOM_RECORDINGS` routes resolved from the attributes (`domains/embedded/utils/wc-route.utils.ts` and its route model); verify with new cases in `domains/embedded/utils/wc-route.utils.spec.ts` run by `./meet.sh test-unit-frontend`.
- [ ] 1.2 Apply it in the recording and room-recordings entry services the same way the meeting entry does (`setEmbeddedLanguage(language)`, `undefined` restoring the stored preference), so every adapter shares it; read `language` in the SPA recording guards (`domains/recordings/guards/extract-recordings-params.guard.ts`). Verify through the e2e scenarios of 1.3: the recordings domain has no entry-service spec file and this change adds none; `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend` stay green.
- [ ] 1.3 Add the scenarios of the delta spec to the `language` tests of `meet-ce/frontend/webcomponent/tests/e2e/attributes.test.ts` (webcomponent and iframe transports); run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.
- [ ] 1.4 Update the TSDoc of `EmbeddedAttribute.LANGUAGE` and `WebComponentPropertyValues.language` in `meet-ce/typings/src/embedded/attributes.ts` to say it also applies to recording screens; no command or event list changes, so the embedded API contract test needs no update, and the testapp already appends `language` to a recording URL on both transports (`testapp/src/app/app.ts`, `buildIframeSrc`), so its controls need none either (verify `meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts` still passes with `./meet.sh test-unit-backend`).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no `Fixed` line, because `language` is new in 3.10.0 itself. Reword its existing `Added` -> `Integration` entry from "sets the initial meeting language" to "sets the initial interface language, meeting and recording screens alike," so it states what ships.
- [ ] 2.2 openvidu.io `next`: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` (the `language` row of `shared/meet/webcomponent/attributes.md` changes); verify with the `check-web` skill.
