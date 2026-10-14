# Design

## Context

`IframeBridgeService` is started by `AppCeMeetingComponent.ngOnInit()`, on purpose: the bridge injects `EmbeddedCommandService`, which depends on the LiveKit-based meeting services, and starting it at the app root would pull them into the eager `main` bundle (budget warn 4 MB, see `meet-ce/frontend/CLAUDE.md`). Events produced earlier stay queued in `EmbeddedEventBusService` and are lost when no meeting page ever appears. `ErrorComponent` already hides its dismiss button in an iframe without a leave redirect, reasoning that no host listens that early.

## Goals / Non-Goals

**Goals:**
- The iframe listens and relays events from app start on every route, including recordings and error screens.
- The eager bundle does not grow by the meeting chunk.

**Non-Goals:**
- A ready event (see proposal, Decisions to confirm).
- Changing which screens show a dismiss button (the join screen button is `fix-iframe-join-back-button`).

## Decisions

1. **Split transport from command execution.** The bridge keeps the origin resolution, the `message` listener, the payload validation and the event relay, which need only the typings, `RuntimeConfigService` and `EmbeddedEventBusService`. It no longer injects `EmbeddedCommandService`; instead the meeting page attaches it when it is created (`bridge.attachCommands(commandService)` in place of `initialize()`), and the bridge dispatches to it. While nothing is attached, a well-formed command is rejected with the warning `EmbeddedCommandService.run()` logs for the phase check, so both paths read the same in the console.
   - Alternative: `import()` the command service lazily inside the bridge on the first command. Rejected: it makes the first command async on a network fetch and adds a second lazy-loading path next to the router's.
   - Alternative: keep starting the bridge on the meeting page and also start it from the recordings and error routes. Rejected: three start points to keep in sync, and commands before the meeting page would still be lost silently.
2. **Start from the library's app startup.** The bridge starts in a `provideAppInitializer` registered next to the existing ones of `meet-ce/frontend/src/app/app.config.ts`, exported by the library so PRO's shell adds the same line. It stays a no-op outside iframe mode, as `initialize()` is today.
3. **Error screen wording.** `ErrorComponent`'s comment about no host listening becomes stale; the button rule itself is unchanged by this change.

No server state is involved: the behavior is the same with any number of Meet replicas.

## Risks / Trade-offs

- [The bridge now lives in the eager bundle] -> It imports nothing from the meeting domain; check the initial bundle size reported by `ng build` before and after.
- [A host that posted commands early and relied on silence] -> The commands never ran before either; only a console warning is added.
