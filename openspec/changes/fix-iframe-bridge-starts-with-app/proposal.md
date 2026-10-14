# Proposal

## Why

In an iframe, Meet starts listening to the host page, and posting events to it, only once the meeting page is shown. Before that point the iframe is deaf and mute:

- A command posted while the app loads or while the access check runs is lost without the console warning `embedded-api` requires for a command received outside its phase.
- `embeddedCloseRequested` is never posted from screens reached without the meeting page: a recording screen (an iframe whose `src` is a recording URL, or a room URL with `show-recording` or `show-only-recordings`) and an access error screen shown before the join screen. With `leave-redirect-url` set, the iframe navigates away without the host page having been told.

The host also has no signal that the iframe is listening. This change proposes no new event: no command can run before the device setup screen anyway, so listening from the start and rejecting with a warning is enough (see Decisions to confirm).

## What Changes

- Meet in an iframe resolves the containing page's origin and starts listening for commands and posting events as soon as the app starts, on every screen, instead of when the meeting page is shown.
- A command posted before the meeting page is shown is rejected with the same console warning as any command outside its phase.
- `embeddedCloseRequested` reaches the host page from recording screens and from access error screens shown before the join screen.

The fix makes these existing requirements hold in the iframe, so no delta spec is written (`skip_specs: true`):

- `embedded-api`, requirement "Commands run only when the meeting phase allows them": "A command received at any other moment SHALL be rejected with a console warning".
- `meeting-join`, requirement "embeddedCloseRequested event": dismissing an error screen or closing a recording screen emits `embeddedCloseRequested` in the iframe too. Its scenarios only exercise the end screen; the tasks add the iframe cases to the e2e suites.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The specs already state the intended behavior.

## Impact

- Embedded API: iframe transport only. No public contract changes: no attribute, command or event is added, renamed or removed.
- Meeting UI: none visible; the iframe's screens do not change.
- REST API, webhooks, console UI, deployment configuration: not affected.
- Code: the iframe bridge and the app startup of the `shared-meet-components` library, keeping the command service and its LiveKit dependencies in the lazy meeting chunk (see design.md). The CE and PRO frontends get the bridge through the same library startup provider, so PRO inherits it without changes.
- openvidu.io: `docs/meet/embedded/reference/iframe.md` gains one sentence saying that the iframe listens from the moment it loads and that commands only run from the device setup screen onwards (see tasks).

## Decisions to confirm

- No ready signal is added (proposed): the iframe listens from the start, commands before the device setup screen are rejected with a warning, and hosts wait for `meetingJoined` before meeting commands. Alternative: a new event, for example `embeddedLoaded`, posted on both transports when Meet starts listening, which would be an additive change to the event catalogue.
