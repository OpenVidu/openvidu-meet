# Proposal

## Why

`loginUser` rejects a `userId` or a password shorter than 5 characters with `422`, but Meet seeds the root admin from `MEET_INITIAL_ADMIN_USER` and `MEET_INITIAL_ADMIN_PASSWORD` without checking either. An operator who sets a 4-character value gets a root admin that can never log in, and nothing tells them why. The `users` spec is silent on it.

## What Changes

- At startup Meet refuses to start, exiting with a non-zero status and a log naming the variable, when `MEET_INITIAL_ADMIN_USER` is shorter than 5 characters.
- It does the same when the root admin account has to be created and `MEET_INITIAL_ADMIN_PASSWORD` is shorter than 5 characters. When the account already exists the password variable is not used, so its value is not checked.
- The check uses the login minimum only (5 characters), not the full `createUser` format, so a root admin `userId` that logs in today keeps working.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `users`: adds the requirement that the root admin configuration is validated at startup.

## Impact

- Deployment configuration: `MEET_INITIAL_ADMIN_USER` and `MEET_INITIAL_ADMIN_PASSWORD` gain a minimum length enforced at startup. A deployment whose root admin `userId` is shorter than 5 characters, which can only be reached with the API key today, stops starting until the variable is fixed.
- REST API, webhooks, embedded API, meeting UI, console UI: not affected. No public contract change.
- Several replicas: every replica runs the same check on the same configuration; the password check runs inside the existing seeding lock, where the account's existence is decided.
- openvidu.io: `docs/docs/self-hosting/configuration/reference.md` (the two variable rows state the minimum length).

## Decisions to confirm

- Refuse to start on a short value (alternatives: drop the 5-character minimum from `loginUser`, or only log a warning and start).
- Check the login minimum only, not the full `userId` format of `createUser` (alternative: enforce lowercase letters, digits and underscores, 5 to 20 characters, which could stop deployments that work today).
- Check `MEET_INITIAL_ADMIN_PASSWORD` only when the root admin is created (alternative: check it on every start).
- Add an `Upgrade notes` line for deployments with a short `MEET_INITIAL_ADMIN_USER` in addition to the `Fixed` line (alternative: the `Fixed` line alone).
