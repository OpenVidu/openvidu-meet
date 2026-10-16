# Tasks

## 1. TSDoc

- [x] 1.1 Rewrite the TSDoc of `EmbeddedAttribute.E2EE_KEY` and `EmbeddedAttribute.PARTICIPANT_NAME` in `meet-ce/typings/src/embedded/attributes.ts` as the proposal states, one `/** ... */` block directly above each member as `scripts/generate-webcomponent-docs.js` expects, and the matching `WebComponentPropertyValues.e2eeKey` and `participantName` comments; factual, not narrative. Verify with `./meet.sh build-typings` and by generating the reference into a scratch directory with `./meet.sh build-webcomponent-doc <scratch dir>` and reading both rows of `attributes.md`. Verified with `tsc -p tsconfig.build.json` in the typings package, run directly instead of `./meet.sh`. The generated `attributes.md` shows both rows.
- [x] 1.2 Confirm nothing else changes: no command or event list moves, so `meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts` and the testapp controls are untouched; verify the contract test with `./meet.sh test-unit-backend`. The embedded API contract test passes (9/9).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. Correcting the TSDoc to describe behavior Meet already had is a documentation-only change under the root `CLAUDE.md` rules.
- [x] 2.2 openvidu.io `next`: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet` (only the `participant-name` and `e2ee-key` rows of `shared/meet/webcomponent/attributes.md` change); verify with the `check-web` skill. Regenerated with `node scripts/generate-webcomponent-docs.js` from `feat/live-broadcast` plus these edits (the published reference already carries the live broadcast commands and events); only the rows of this batch changed. `check-web` passed: lint without errors, strict build without warnings.
