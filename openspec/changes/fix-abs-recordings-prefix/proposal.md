# Proposal

## Why

With `MEET_BLOB_STORAGE_MODE=abs`, Meet tells the recorder to write each recording under
`MEET_S3_SUBBUCKET`, but reads, downloads and deletes recordings under
`MEET_AZURE_SUBCONTAINER_NAME`. When the two variables differ, every recording completes but can
never be played, downloaded or deleted from storage. Both default to `openvidu-meet`, so only
deployments that set one of them are hit.

## What Changes

- The recording output path given to the recorder uses the prefix of the selected storage mode:
  `MEET_AZURE_SUBCONTAINER_NAME` with `abs`, `MEET_S3_SUBBUCKET` with `s3` and `gcs` (unchanged).
- The prefix of each mode is defined in one place, used both to write and to read recordings.
- The `deployment` spec states that recordings are written and read under that prefix, with an ABS
  scenario.
- Recordings already written under `MEET_S3_SUBBUCKET` in an affected deployment are not moved.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: "Storage provider selection" states that recordings are written and read under the
  mode's prefix, and adds an ABS scenario.

## Impact

- Deployment configuration: `MEET_AZURE_SUBCONTAINER_NAME` now also decides where new ABS
  recordings are written. No variable is added, renamed or removed.
- REST API, webhooks, embedded API, meeting UI, console UI: not affected, except that recordings of
  affected ABS deployments become playable, downloadable and deletable.
- Code: the recording output path of the recording service and the ABS key prefix in
  `meet-ce/backend`.
- Overlap with open PR #116 (`feat/abs-managed-identity`): it edits the constructor and the health
  check of the ABS service, `logEnvVars` in `environment.ts` and adds an `Added` > `Deployment` line to
  `CHANGELOG.md`. This change touches the key-prefix helper of the same ABS service file, so the two
  may meet in a textual merge but not in behavior. PR #116 has no OpenSpec change yet; when it gets
  one it modifies "Azure Blob Storage credentials" of `deployment`, a different requirement from the
  one modified here, so the deltas do not conflict.
- openvidu.io: none. `docs/docs/self-hosting/configuration/reference.md` already says
  `MEET_AZURE_SUBCONTAINER_NAME` is where Meet stores recordings, which becomes true.

## Decisions to confirm

- ABS writes under `MEET_AZURE_SUBCONTAINER_NAME`, the variable the spec and the configuration page
  document for ABS. Alternative: make ABS read under `MEET_S3_SUBBUCKET`, as GCS already does, and
  deprecate `MEET_AZURE_SUBCONTAINER_NAME`.
- No migration moves the blobs an affected deployment already wrote under `MEET_S3_SUBBUCKET`; the
  changelog states where they are. Alternative: a one-off startup migration that copies them under the
  Azure prefix.
