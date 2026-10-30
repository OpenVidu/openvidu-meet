# Proposal

## Why

The `<openvidu-meet>` loader keeps every command method a host calls before the full bundle has loaded and replays it once the bundle is in. At that moment the participant has not reached the device setup screen, let alone the meeting, so the phase check of `embedded-api` rejects every replayed command: the buffer can only ever delay a rejection. When the replay reaches the element before its Meet has started, the call is even dropped without the console warning every other rejected command gets.

## What Changes

- A command method called on `<openvidu-meet>` before its full bundle has loaded is rejected at once, with a console warning naming the command, instead of being kept and replayed after the load.
- A command method called on the element before its Meet has started (a host that imports the full bundle directly) is rejected with the same warning instead of being ignored silently.
- Attributes, properties and listeners set before the load are still kept, as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-distribution`: "Calls made before the bundle loads are kept" no longer keeps command calls; it rejects them at once, consistent with the `embedded-api` rule that a command received outside its phase is not kept for later.

## Impact

- Embedded API: the webcomponent only (the iframe has its own change, `fix-iframe-bridge-starts-with-app`). No public contract changes: no attribute, command or event is added, renamed or removed, and the outcome a host observes is the same (the command never ran before and does not run now); only the console warning comes earlier and is never missing.
- Meeting UI, console UI, REST API, webhooks, deployment configuration: not affected.
- Code: the webcomponent loader and the element wrapper (`meet-ce/frontend/webcomponent/src/`), less code than today.
- openvidu.io: none. `docs/meet/embedded/reference/webcomponent.md` does not describe buffering of commands.

## Decisions to confirm

- A command called before the bundle loads is rejected at once (proposed), instead of being kept until the meeting phase allows it, which would contradict the `embedded-api` rule "SHALL NOT be kept for later" and need a new rule for when such a command expires.
