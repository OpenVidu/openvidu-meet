# Tasks

## 1. Settle the scope of the shortcuts

- [ ] 1.1 Record the answers to both decisions in `proposal.md` (Option A, B or both; `F11` included or not) and delete the groups below that no longer apply.
- [ ] 1.2 Add the deltas the decision calls for: `raise-hand` "Raise hand from the toolbar and the keyboard" and `reactions` "Reaction keyboard shortcuts" (a scenario with the focus on a host page button inside `<openvidu-meet>`), `meeting-layout`'s fullscreen requirement if `F11` follows, and under Option B an `embedded-api` requirement for the attribute; remove `skip_specs: true` from `.openspec.yaml` and verify with `npx openspec validate fix-webcomponent-shortcuts-scope --strict`.

## 2. Keys only from inside the element (Option A)

- [ ] 2.1 Give `isShortcut` in `keyboard-shortcut.utils.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/utils/`) the meeting's root node as a second argument and accept only events whose `composedPath()` contains it: the element's shadow root inside `<openvidu-meet>`, the document in the iframe and the standalone app, so no mode branch is needed. Pass the root node of the component's own element (`ElementRef.nativeElement.getRootNode()`) from `onHandShortcut` (`meeting-toolbar-extra-buttons.component.ts`) and from `onShortcut` and `pickerKeydown` (`meeting-toolbar-reactions-button.component.ts`), and from the `F11` listener of `toolbar.component.ts` if `F11` follows; the picker overlay already lives in the shadow root.
- [ ] 2.2 Make the meeting focusable (`tabindex="-1"` on the root of `meeting-view.component.html`, no visible outline) so a click on the video grid or any non-focusable part of the meeting moves the focus inside the element.
- [ ] 2.3 Verify in `meet-ce/frontend/webcomponent/tests/e2e/room.test.ts`, next to "should leave every key typed in the chat to the chat, the meeting shortcuts included": with the focus on a host page button, `r` and `e` change nothing (`#raise-hand-button` stays inactive, no picker); after a click on the meeting, `r` raises the hand. Run `./meet.sh test-e2e-webcomponent` and the `R`/`E` cases of `meet-ce/frontend/e2e/participants.test.ts` with `./meet.sh test-e2e-frontend` (both need the OpenVidu local deployment; report as not run when unavailable), plus `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.

## 3. Attribute to turn the shortcuts off (Option B)

- [ ] 3.1 Add the attribute to `EmbeddedAttribute` in `meet-ce/typings/src/embedded/attributes.ts` with its TSDoc (name to confirm with the naming charter in `meet-ce/typings/CLAUDE.md`, boolean, `true` by default), read it in the webcomponent and as a URL parameter in the iframe, and expose it to the meeting through `RuntimeConfigService`.
- [ ] 3.2 Make `onHandShortcut`, `onShortcut`, `pickerKeydown` (and the `F11` listener if it follows) ignore keys while the attribute is `false`. Verify with an attribute case in `meet-ce/frontend/webcomponent/tests/e2e/attributes.test.ts` (`r` with the attribute `false` leaves the hand down); the embedded API contract test (`meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts`) freezes only commands and events and needs no change. Run `./meet.sh test-unit-webcomponent`, `./meet.sh test-e2e-webcomponent` (needs the OpenVidu local deployment; report as not run when unavailable) and `./meet.sh lint-webcomponent`.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`, under `## 3.10.0 (unreleased)`: no line for `R`, `E` and the digits (raise hand and reactions are new in 3.10.0). Option B names the new attribute in the raise hand and reactions entries of `### Added` > `#### Integration`. If `F11` follows, add under `### Fixed` > `#### Integration`: "Inside `<openvidu-meet>`, `F11` anywhere on the host page toggled the meeting's fullscreen. It now acts only with the focus inside the element." (Option A wording; under Option B only, "It can now be turned off with `<attribute>`.").
- [ ] 4.2 openvidu.io `docs/meet/features/meetings/raise-hand.md` and `docs/meet/features/meetings/reactions.md` (branch `next`): the sentences "press the `R` key anywhere outside a text field" and "press `E` anywhere outside a text field" say where the keys work inside an embedded Web Component (Option A) or how the host turns them off (Option B).
- [ ] 4.3 Option B only: regenerate the embedded API reference with `./meet.sh build-webcomponent-doc ../openvidu.io/shared/meet`.
