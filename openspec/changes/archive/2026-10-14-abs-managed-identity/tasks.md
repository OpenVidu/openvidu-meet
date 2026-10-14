# Tasks

## 1. Azure Blob Storage authentication

- [x] 1.1 Build the blob client from the account URL with a shared-key credential when `MEET_AZURE_ACCOUNT_KEY` is set and a `ManagedIdentityCredential` otherwise; require only the account and container names; verified by the backend unit tests of the ABS service.
- [x] 1.2 Make the storage health check list blobs so that missing data access is reported; verified by the unit tests and the ABS recordings integration suite.
- [x] 1.3 Print in the startup configuration that managed identity is used when no key is set.
- [x] 1.4 Add `@azure/identity` and relock without `@azure/msal-browser`.

## 2. Release surfaces

- [x] 2.1 Add the Added > Deployment line to `CHANGELOG.md`: "Azure Blob Storage authenticates with the Azure managed identity of the VM or pod running Meet when `MEET_AZURE_ACCOUNT_KEY` is empty."
- [x] 2.2 openvidu.io `next` (commit 28396bb2c): state in the `MEET_AZURE_ACCOUNT_KEY` row of `docs/docs/self-hosting/configuration/reference.md` that it may be left empty to use the managed identity.
