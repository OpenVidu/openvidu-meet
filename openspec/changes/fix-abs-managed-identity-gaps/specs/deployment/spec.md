## ADDED Requirements

### Requirement: Choosing a user-assigned managed identity
In `abs` mode with an empty `MEET_AZURE_ACCOUNT_KEY`, Meet SHALL authenticate with the user-assigned managed identity whose client id is in `AZURE_CLIENT_ID` when that variable is set, and with the default managed identity of the VM or pod otherwise.

#### Scenario: VM with two user-assigned identities
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs`, an empty `MEET_AZURE_ACCOUNT_KEY`, a VM with two user-assigned identities and `AZURE_CLIENT_ID` set to the one holding the Storage Blob Data Contributor role
- **WHEN** Meet starts
- **THEN** it accesses the container with that identity
