# Tasks

## 1. Bound the queue

- [ ] 1.1 In `iframe-bridge.service.ts` (`domains/embedded/services`), when `initialize()` refuses to open, drain and drop the bus queue; in `embedded-event-bus.service.ts`, avoid copying the array on each `emit` and make `delivered()` resolve at once when no consumer exists. Verify with cases in the existing unit specs of both services (no growth after a refused open, `delivered()` resolves without waiting; use the clock collaborator, not a scaled sleep). Run with `./meet.sh test-unit-frontend`.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. The queue and the delivery wait belong to the unreleased iframe bridge (#135).
- [ ] 2.2 openvidu.io: none.
