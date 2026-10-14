## MODIFIED Requirements

### Requirement: Azure Blob Storage credentials
In `abs` mode Meet SHALL authenticate over HTTPS to the account `MEET_AZURE_ACCOUNT_NAME` with the shared key `MEET_AZURE_ACCOUNT_KEY` when it is set, and with the managed identity of the VM or pod it runs on when it is empty. It SHALL abort startup when the account name or the container name is empty, and SHALL report at startup a credential that cannot read the container.

#### Scenario: Shared key
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs` and a valid `MEET_AZURE_ACCOUNT_KEY`
- **WHEN** Meet starts
- **THEN** it reads and deletes recordings with the shared key

#### Scenario: Missing account key
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs`, an empty `MEET_AZURE_ACCOUNT_KEY` and a VM whose managed identity holds the Storage Blob Data Contributor role on the account
- **WHEN** Meet starts
- **THEN** it accesses the container with that identity and no static credential

#### Scenario: Managed identity without data access
- **GIVEN** an empty `MEET_AZURE_ACCOUNT_KEY` and a managed identity with no role on the container's data
- **WHEN** Meet starts
- **THEN** the storage check reports the container as not accessible

#### Scenario: Missing account name
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs` and an empty `MEET_AZURE_ACCOUNT_NAME`
- **WHEN** Meet starts
- **THEN** startup fails reporting that the Azure Blob Storage configuration is incomplete
