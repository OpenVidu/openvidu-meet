# Tasks

## 1. One storage prefix per mode for writing and reading recordings

- [ ] 1.1 Make the blob storage service build the recorder's output path through the active provider's key prefix, and use it in the recording output of `meet-ce/backend/src/services/recording.service.ts` in place of `MEET_ENV.S3_SUBBUCKET`. Verify with a unit case in `meet-ce/backend/tests/unit/services/recording.service.test.ts` that, with the ABS provider and `AZURE_SUBCONTAINER_NAME` different from `S3_SUBBUCKET`, the output path starts with the Azure prefix, and with S3 it still starts with `S3_SUBBUCKET`.
- [ ] 1.2 Verify the S3 recording suites (`meet-ce/backend/tests/integration/api/recordings/`) still pass, since the output path for S3 and GCS is unchanged (backend integration suite, needs the OpenVidu local deployment; ABS runs only on `main`; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Deployment` of `CHANGELOG.md`: "With `MEET_BLOB_STORAGE_MODE=abs`, recordings were written under `MEET_S3_SUBBUCKET` but read under `MEET_AZURE_SUBCONTAINER_NAME`, so they could not be played, downloaded or deleted when the two differed. They are now written under `MEET_AZURE_SUBCONTAINER_NAME`."
- [ ] 2.2 Add under `## 3.10.0 (unreleased)` > `### Upgrade notes` of `CHANGELOG.md` (pending the decision on migration): "In an Azure Blob Storage deployment whose `MEET_S3_SUBBUCKET` and `MEET_AZURE_SUBCONTAINER_NAME` differ, the recordings made before 3.10.0 stay under `MEET_S3_SUBBUCKET`, where Meet does not read them."
- [ ] 2.3 openvidu.io: none (`docs/docs/self-hosting/configuration/reference.md` already describes the fixed behavior).
