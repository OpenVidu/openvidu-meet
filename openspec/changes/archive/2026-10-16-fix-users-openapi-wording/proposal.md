# Proposal

## Why

The `getUsers` reference describes `userId` and `name` as two filters, which reads as both applying at once. The server returns a user matching either one when both are given (`userId` exact, `name` per `nameMatchMode` and `nameCaseInsensitive`), as the `users` spec already states ("Filter users", scenario "Search by user ID or name"). An integrator combining them gets more users than the reference suggests.

## What Changes

- The `userId` and `name` query parameters of `getUsers` say that `userId` matches exactly and that, given together, a user matching either one is returned; `role` still narrows the result.
- The TSDoc of `userId` and `name` in `MeetUserFilters` says the same.
- Documentation only: no behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`): documentation only; the behavior is already specified in `users`.

## Impact

- REST API reference: wording of two `getUsers` parameters in `meet-ce/backend/openapi/users/parameters/`. No contract change.
- Typings: TSDoc of `MeetUserFilters` in `meet-ce/typings/src/response/user-response.ts`.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: no page edits; the REST API reference page is regenerated from the OpenAPI.
