# Tasks

## 1. One registration per callback

- [ ] 1.1 Make `on` return early when the callback is already registered for the event, and register `once` callbacks under the caller's callback so `off(event, callback)` finds them; move the bookkeeping shared by `main.loader.ts` and `wrapper.ts` into one helper both use (the loader must still not import Angular). Verify with new cases in `tests/unit/loader.test.ts` and `tests/unit/wrapper.test.ts` ("event forwarding" / "event subscription"): `on` twice runs once, `on` twice then `off` runs never, `once` then `off` before the event runs never, `on` then `once` keeps the permanent registration; run `./meet.sh test-unit-webcomponent` and `./meet.sh lint-webcomponent`.
- [ ] 1.2 Embedded API surfaces: no attribute, command or event is added, renamed or removed, so the embedded API contract test (`meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts`), the testapp controls and the generated reference need no update; verify the contract test still passes with `./meet.sh test-unit-backend`.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "Registering the same callback twice with `on()` on `<openvidu-meet>` called it twice per event and left one registration that `off()` could not remove, and a callback registered with `once()` could not be removed with `off()`. A callback is now registered once per event, and `off()` removes it however it was added."
- [ ] 2.2 openvidu.io: none. The listener API section of `docs/meet/embedded/reference/webcomponent.md` stays correct, and the embedded API reference does not change, so nothing is regenerated.
