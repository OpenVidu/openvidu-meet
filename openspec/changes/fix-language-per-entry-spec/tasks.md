# Tasks

## 1. Align the spec

- [ ] 1.1 Apply the delta at archive time to `openspec/specs/localization/spec.md` ("Language requested by the host"); no code changes. Verify the existing unit specs of the webcomponent `language` effect and of the language guard already cover "set or changed" and "removed restores the stored preference"; add a case to them only if one is missing (`./meet.sh test-unit-webcomponent`, `./meet.sh test-unit-frontend`).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. The `language` attribute is new in 3.10.0 (#102); if its entry says each entry restarts in the requested language, reword it to "when set or changed".
- [ ] 2.2 openvidu.io: none unless the localization page repeats the per-entry wording; fix it on `next` if so.
