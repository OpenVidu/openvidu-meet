# Tasks

Paths are relative to `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/`.

## 1. Apply the start response

- [ ] 1.1 In `request` of `meeting/services/broadcast.service.ts`, call `setBroadcast` on every broadcast of the response of a start (and of a stop). Verify in `meeting/services/broadcast.service.spec.ts` (create the case in the existing file): after a start response, the state lists the broadcasts running, and a signal for the same broadcast leaves it unchanged.
- [ ] 1.2 In `embedded/services/embedded-command.service.ts` (the `broadcastStop` guard around lines 221-232), keep the guard only if the state now covers the window; otherwise remove it. Verify in `embedded/services/embedded-command.service.spec.ts`: a `broadcastStop` issued after the start response and before any signal reaches the server. Run `./meet.sh test-unit-frontend` and `./meet.sh lint-frontend`.

## 2. Spec

- [ ] 2.1 Update requirement "Embedded broadcast commands" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` with a scenario "Stop right after start" (WHEN the host sends `broadcastStop` after `broadcastStart` was answered and before any broadcast event; THEN the broadcast stops).

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own.
- [ ] 3.2 openvidu.io: none. Embedded API contract test: unchanged (no command or event is added).
