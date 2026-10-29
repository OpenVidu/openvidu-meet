# Proposal

## Why

The `on`/`once`/`off` listener API of `<openvidu-meet>` keys each registration by its callback but attaches a new DOM listener on every call:

- Calling `on(event, callback)` twice with the same callback attaches two listeners, so the callback runs twice per event, and `off(event, callback)` then removes only the second one: the first stays attached and can no longer be removed except with `off(event)`.
- A callback registered with `once(event, callback)` is stored under an internal wrapper, so `off(event, callback)` does not find it and it still fires once.

Both happen in the loader that hosts use and in the element that a host importing the full bundle directly gets.

## What Changes

- A callback already registered for an event, with `on` or `once`, is not registered again: it runs once per event, and one `off(event, callback)` removes it. This matches `addEventListener`, which ignores a listener added twice.
- `off(event, callback)` removes a callback registered with `once` before it has fired.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-api`: adds the requirement "Listener callbacks are registered once per event". The `once` and `off` case needs no delta: it makes the existing requirement "Listener API" ("`off` with a callback SHALL remove that callback") hold, and the tasks add its scenario as a test.

## Impact

- Embedded API: the webcomponent listener API only; the iframe has none. No public contract changes: same methods and signatures.
- Meeting UI, console UI, REST API, webhooks, deployment configuration: not affected.
- Code: the listener bookkeeping of `meet-ce/frontend/webcomponent/src/main.loader.ts` and `src/app/custom-element/wrapper.ts`, which duplicate it today and can share one implementation.
- openvidu.io: none. `docs/meet/embedded/reference/webcomponent.md` documents `on`/`once`/`off` without the duplicate case.

## Decisions to confirm

- Registering the same callback twice is ignored, as `addEventListener` does (proposed). Alternative: each call adds a registration and `off(event, callback)` removes all of them.
- A callback registered with `on` and then with `once` keeps its first registration (proposed, same rule). Alternative: the later call replaces the earlier one.
