# Proposal

## Why

The `roomId` description of the public webhook schema (`meet-ce/backend/openapi/webhooks/schemas/meet-webhook-endpoint.yaml:40-44`) and the class comment of `WebhookRegistryService` (`meet-ce/backend/src/services/webhook-registry.service.ts:28-30`) say a webhook "can be registered before its room is created". That cannot happen: the server generates every room identifier with a random suffix, so nobody knows a room's identifier before `createRoom` returns it. The schema line also carries an em dash, against the repository's writing rules, and the comment points at a roadmap decision number that means nothing in this repository.

## What Changes

- The `roomId` description says the identifier is not checked against existing rooms, so a webhook scoped to a room that does not exist, or no longer exists, receives no event; the "registered before its room is created" claim and the em dash go.
- The `WebhookRegistryService` comment drops the same claim and the roadmap reference, keeping only the constraint the code cannot express: `roomId` is never validated against rooms.

Documentation only: no behavior changes and no changelog line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `webhooks` spec already states this behavior (requirement "The room scope is an opaque filter", scenarios "Room that does not exist" and "Room deleted").

## Impact

- Surfaces: the public REST API reference (`MeetWebhookEndpoint` schema). No wire change.
- Code: one comment in the backend.
- openvidu.io: the generated REST API reference `docs/meet/embedded/reference/api.html` is regenerated on `next`.
