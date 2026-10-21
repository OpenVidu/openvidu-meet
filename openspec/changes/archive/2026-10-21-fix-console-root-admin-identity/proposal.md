# Proposal

## Why

The server's root admin is the account whose `userId` equals `MEET_INITIAL_ADMIN_USER`, but the console guesses it as the earliest registered user, because no response tells it which account that is. After `MEET_INITIAL_ADMIN_USER` changes (the `users` scenario "Root admin user ID changed"), the console protects the old `admin` row, which the server lets an administrator delete, and offers delete, role change and password reset on the real root admin, which the server refuses with `403`. The openvidu.io users overview also states a fixed `userId` `admin`.

## What Changes

- Every user the server returns carries `isRootAdmin`, `true` only for the `MEET_INITIAL_ADMIN_USER` account.
- The console users list and profile pages read `isRootAdmin` to mark and protect the root admin, and stop listing the earliest registered user to guess it.
- The openvidu.io users overview says the root admin is the `MEET_INITIAL_ADMIN_USER` account (default `admin`), protected from deletion, role change and password reset by other administrators.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `users`: adds the requirement that user responses identify the root admin, and a scenario to "Console users list" for a root admin that is not the earliest registered user.

## Impact

- REST API: `createUser`, `getUsers`, `getUser` and `updateUserRole` responses gain `isRootAdmin` (additive); the `MeetUser` schema under `meet-ce/backend/openapi/users/schemas/` and the `MeetUserDTO` TSDoc in `meet-ce/typings/src/response/user-response.ts` describe it.
- Internal API: `getMe` gains the same field.
- Console UI: users list and profile pages protect the right account; one request fewer per page load.
- Webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: `docs/meet/features/users/overview.md` (root administrator section) and the REST API reference regenerated from the public OpenAPI.

## Decisions to confirm

- Expose the root admin as an `isRootAdmin` field on every user response (alternatives: a new internal endpoint returning the root admin, which needs a module token for users in the naming registry; or a field on `getMe` only).
- Publish the field on the public REST API too, not only to the console (alternative: strip it from public responses).
