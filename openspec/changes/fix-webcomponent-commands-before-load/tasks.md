# Tasks

## 1. Reject early commands in the loader and the wrapper

- [ ] 1.1 In `meet-ce/frontend/webcomponent/src/main.loader.ts`, make each delegated command method forward to the impl when it is mounted and otherwise log `console.warn` naming the command (deprecated names keep their own name) and return; remove the deferred-call buffer and its replay in `_upgrade()`. Verify by replacing the "pre-load buffering" command cases of `tests/unit/loader.test.ts` (replay, deprecated replay, unimplemented replay) with cases asserting the warning and that nothing reaches the impl once it mounts, keeping the property and attribute cases; run `./meet.sh test-unit-webcomponent`.
- [ ] 1.2 In `src/app/custom-element/wrapper.ts`, log the same warning when a command method runs before the Angular component instance exists, instead of the silent no-op. Verify by updating "are no-ops when the Angular component instance is not yet available" in `tests/unit/wrapper.test.ts` to assert the warning; run `./meet.sh test-unit-webcomponent` and `./meet.sh lint-webcomponent`.
- [ ] 1.3 Update the loader section of `meet-ce/frontend/webcomponent/CLAUDE.md` ("imperative calls made before load are buffered and replayed") and the loader's header comment to the new rule; verify by reading them against the delta spec.
- [ ] 1.4 Check that the webcomponent e2e suites do not rely on a command called before the load (`tests/e2e/commands.test.ts`); run `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.
- [ ] 1.5 Embedded API surfaces: no attribute, command or event is added, renamed or removed, so the embedded API contract test (`meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts`), the testapp controls and the generated reference need no update; verify the contract test still passes with `./meet.sh test-unit-backend`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line. The outcome a host can observe does not change (a command called before the load never ran and still does not); only the moment of the console warning does, which is not a product behavior under the root `CLAUDE.md` rules.
- [ ] 2.2 openvidu.io: none. No reference page describes the buffering, and the embedded API reference does not change, so nothing is regenerated.
