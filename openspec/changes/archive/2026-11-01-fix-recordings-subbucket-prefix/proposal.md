# Proposal

## Why

With `MEET_S3_SUBBUCKET` or `MEET_AZURE_SUBCONTAINER_NAME` set to `recordings`, 3.10 writes and reads recordings at `recordings/<roomId>/...`, while 3.9 wrote them at `recordings/recordings/<roomId>/...`. Recordings made before the upgrade cannot be played, downloaded or deleted, and the 3.10.0 changelog says this case is fixed.

## What Changes

- Every storage key gets the prefix, with no exception for a key that already starts with it; the "already prefixed" branch and its test are deleted.
- The unit test asserts the layout `<prefix>/recordings/...` instead of only that writing and reading agree.
- With an empty prefix the recorder's output path becomes `recordings/...` (it was `/recordings/...`), consistent with reads.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: recordings always live under `<prefix>/recordings/`, for any prefix value.

## Impact

- Deployment configuration: S3, GCS and ABS layouts. Deployments with the default prefix keep their layout; a `recordings` prefix reads the 3.9 layout again; an ABS deployment whose two prefixes differed keeps its old recordings unreachable, as already decided (no move, no upgrade note).
- REST API, webhooks, embedded API, meeting UI, console UI: not affected.
- Code: `utils/storage-key.utils.ts` and `services/storage/blob-storage.service.ts` in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- None: no caller passes an already prefixed key back, so always prefixing is safe.

## Source

3.10.0 pre-release audit, finding AU-5 (medium, verified-test), introduced by #126.
