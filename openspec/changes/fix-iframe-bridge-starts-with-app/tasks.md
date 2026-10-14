# Tasks

## 1. Bridge from app start

- [ ] 1.1 Remove the `EmbeddedCommandService` injection from `domains/embedded/services/iframe-bridge.service.ts`; add the attach entry point used by `AppCeMeetingComponent` and reject well-formed commands with the phase warning while none is attached. Verify with new cases in `domains/embedded/services/iframe-bridge.service.spec.ts` (command before attach is warned and not run, command after attach runs, events queued before start are relayed once the origin is known) run by `./meet.sh test-unit-frontend`.
- [ ] 1.2 Start the bridge from an app initializer exported by the library and registered in `meet-ce/frontend/src/app/app.config.ts`; keep it a no-op outside iframe mode. Verify with `./meet.sh test-unit-frontend`, `./meet.sh lint-frontend`, and by comparing the initial bundle size printed by `./meet.sh build` before and after (no meeting-domain chunk moves into `main`).
- [ ] 1.3 Update the comment of `shared/components/error/error.component.ts` and the `IframeBridgeService` section of `meet-ce/frontend/webcomponent/CLAUDE.md` to the new start point; verify by reading them against design.md.
- [ ] 1.4 Add iframe e2e cases next to the existing ones in `meet-ce/frontend/webcomponent/tests/e2e/events.test.ts` (iframe parametrization): `embeddedCloseRequested` reaches the host page when closing the recording view opened with `show-recording`, and when dismissing an "Invalid link" error screen with `leave-redirect-url` set, before the redirect. Run with `./meet.sh test-e2e-webcomponent` against the local deployment, or report it as not run when the deployment is unavailable.
- [ ] 1.5 Embedded API surfaces: no attribute, command or event is added, renamed or removed, so the embedded API contract test (`meet-ce/backend/tests/unit/typings/embedded-api-contract.test.ts`), the testapp controls and the generated reference need no update; verify the contract test still passes with `./meet.sh test-unit-backend`.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "Meet in an iframe did not post `embeddedCloseRequested` to the host page from a recording screen or from an access error screen shown before the join screen, and dropped commands posted before the join screen without a console warning. It now listens to the host page and posts events from the moment it loads."
- [ ] 2.2 openvidu.io `next`, `docs/meet/embedded/reference/iframe.md` (Commands section): add that the iframe listens from the moment it loads and that commands run only from the device setup screen onwards, being rejected with a console warning before; verify with the `check-web` skill. The embedded API reference does not change, so nothing is regenerated.
