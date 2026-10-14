## Why

`MEET_AZURE_ACCOUNT_KEY` is a full-account, non-expiring shared key that OpenVidu's Azure deployments
have to write to disk on every VM. Azure offers the equivalent of an AWS instance role: a VM or pod
whose managed identity holds an RBAC role on the storage account can authenticate with no static
credential at all.

## What Changes

- In `abs` mode, an empty `MEET_AZURE_ACCOUNT_KEY` makes Meet authenticate with the managed identity of
  the VM or pod it runs on; a set key keeps the shared-key authentication.
- Startup only requires `MEET_AZURE_ACCOUNT_NAME` and `MEET_AZURE_CONTAINER_NAME`.
- The storage check at startup lists blobs, so a managed identity without data access to the
  container is reported instead of passing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: "Azure Blob Storage credentials" accepts a managed identity when the account key is empty.

## Impact

- Deployment configuration only; no API, webhook or UI change.
- New dependency `@azure/identity`.
- CHANGELOG: an Added > Deployment line.
- openvidu.io: the `MEET_AZURE_ACCOUNT_KEY` row of `docs/docs/self-hosting/configuration/reference.md`
  states that it may be left empty to use the managed identity.
