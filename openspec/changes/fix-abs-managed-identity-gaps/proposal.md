# Proposal

## Why

Azure managed identity works only when the VM has one identity: Meet cannot say which user-assigned identity holds the storage role, so with several the storage check fails at startup. And an Azure deployment cannot run without the account key anyway: OpenVidu's installers require `MEET_AZURE_ACCOUNT_KEY` and the recorder uploads with an account key only, so the key stays on disk.

## What Changes

- Meet gives the managed identity credential the client id in `AZURE_CLIENT_ID` when it is set, so a user-assigned identity can be chosen.
- The installers (`openvidu-deployment`) and the recorder (`egress`) live outside this repository: this change records the follow-up for each and makes the Meet documentation say that the recorder still needs the account key.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: the managed identity Meet uses can be chosen with `AZURE_CLIENT_ID`.

## Impact

- Deployment configuration: `AZURE_CLIENT_ID` (the standard Azure variable, no new Meet variable) read when `MEET_AZURE_ACCOUNT_KEY` is empty; additive.
- Out of this repository: installers accepting an empty key for Meet and the recorder gaining identity support (follow-ups, not done here).
- REST API, webhooks, embedded API, meeting UI, console UI: not affected.
- Code: the constructor of `meet-ce/backend/src/services/storage/providers/abs/abs.service.ts`.
- openvidu.io: the pages that document `MEET_AZURE_ACCOUNT_KEY` and Azure storage (named in the Purpose of `deployment`).

## Decisions to confirm

- How to name the identity. Proposed: the standard `AZURE_CLIENT_ID`. Alternative: a new `MEET_AZURE_CLIENT_ID`, consistent with the other Meet variables. Alternative: document system-assigned or single user-assigned identities only.

## Source

3.10.0 pre-release audit, findings AU-6 and AU-7 (low, static-high), introduced by #116.
