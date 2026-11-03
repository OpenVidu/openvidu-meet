# Tasks

## 1. Apply the decision

- [ ] 1.1 Option A: in the tag matching of `meet-ce/frontend/projects/shared-meet-components/src/lib/shared/services/i18n/language.service.ts`, return no match for `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO` (and the same for `auto`), keeping `zh`, `zh-CN` and `zh-Hans` on Simplified. Verify with cases in its existing unit spec. Option B: no code change.
- [ ] 1.2 Update `localization` "Language tag matching" (and "Supported languages" if needed) in `openspec/specs/localization/spec.md` through a delta of this change, and the TSDoc of `language` in `meet-ce/typings/src/embedded/`; refresh the embedded API contract test if the TSDoc text is frozen there.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. The `language` attribute is new in 3.10.0 (#102), so no line of its own; amend its entry only if option A changes what it states.
- [ ] 2.2 openvidu.io: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet`, and state the Chinese matching on the localization page of `docs/meet/` if it lists languages.
