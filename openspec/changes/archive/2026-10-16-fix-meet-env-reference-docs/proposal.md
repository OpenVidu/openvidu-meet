# Proposal

## Why

The `meet.env` table of openvidu.io `docs/docs/self-hosting/configuration/reference.md` (branch `next`) misses variables Meet reads and misdescribes others, so an operator cannot configure a deployment from it:

- Missing: how Meet authenticates to Google Cloud Storage. The table also leaves out `MEET_NAME_ID`, `MEET_BASE_URL`, `MEET_CONFIG_DIR` and the MongoDB variables (`MEET_MONGO_*`), which stay out of it (see What Changes).
- `SERVER_TRUST_PROXY` (line 53) lists `true`, `false` and a hop count, but Meet also takes a comma-separated list of addresses and subnets.
- `MEET_S3_SSE_TYPE`, `MEET_S3_SSE_KMS_KEY_ID` and `MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT` (lines 76-78) read as if they encrypted Meet's data, but Meet never writes an object to the bucket: recordings are written by the egress, which follows `EXTERNAL_S3_SSE_*` of `openvidu.env`. Meet only validates these three at startup and stops on an invalid combination.

## What Changes

- No row is added: the variables the table does not list (`MEET_NAME_ID`, `MEET_BASE_URL`, `MEET_CONFIG_DIR` and `MEET_MONGO_*`) stay out of it (USER decision, 2026-10-16).
- `MEET_BLOB_STORAGE_MODE`, `MEET_S3_BUCKET` and `MEET_S3_SUBBUCKET` say that `gcs` reuses the two S3 bucket variables and authenticates with Google Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` or the machine's service account).
- `SERVER_TRUST_PROXY` adds the list of addresses and subnets.
- The three `MEET_S3_SSE_*` rows say Meet writes nothing to the bucket, so they encrypt nothing; recordings follow `EXTERNAL_S3_SSE_*`, and Meet only refuses to start when the combination is invalid.

Documentation only: no behavior changes and no changelog line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `deployment` spec already states this behavior (requirements "Storage provider selection", "S3 server-side encryption settings", "Google Cloud Storage credentials" and "Trusted proxies"); the page is brought in line with it.

## Impact

- Surfaces: openvidu.io documentation only. No Meet code, contract or configuration changes.
- openvidu.io: `docs/docs/self-hosting/configuration/reference.md` on `next`.

## Decisions to confirm

- Decided (USER, 2026-10-16): the `MEET_S3_SSE_*` rows stay, reworded to say they encrypt nothing and are only validated. Rejected alternatives: remove the rows, or remove the three variables from Meet (a separate code change to the `deployment` requirement "S3 server-side encryption settings").
