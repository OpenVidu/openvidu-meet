# Proposal

## Why

Saving a room whose destination `id` is a name such as `constructor` or `toString` is refused with the
misleading error "Duplicate destination: ... has the stream key of another destination", instead of
saying the id is not one of the room's destinations.

## What Changes

- The check of a destination `id` against the saved destinations only counts ids the room really holds,
  so such an id gets the same `422` "not one of the room's destinations" as any other unknown id.
- No delta of its own: `add-live-broadcast` states that a destination sent with an `id` the room does not
  hold is refused with `422`; a task adds the scenario with an id that is a property name.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task adds a scenario to the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- REST API: only the message of an existing `422` changes. Webhooks, embedded API, UIs, deployment
  configuration: not affected.
- Code: `meet-ce/backend/src/helpers/broadcast.helper.ts` (lookups of `savedUrls` and `urls`).
- openvidu.io: none.

## Decisions to confirm

- How the lookup is made safe. Proposed: `Object.hasOwn`, the smallest change. Alternative: build the
  lookups as `Map`s, which removes the class of bug.

## Source

3.10.0 pre-release audit, finding BB-5 (low, verified-live), introduced by #120.
