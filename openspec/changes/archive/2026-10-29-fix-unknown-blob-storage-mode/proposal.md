# Proposal

## Why

An unknown `MEET_BLOB_STORAGE_MODE` value, such as a typo (`gsc`) or another case (`GCS`), makes Meet silently use S3 storage with the S3 defaults: startup then fails on an unrelated S3 error, or worse, succeeds against a local MinIO and stores nothing where the operator expects. The `deployment` spec lists the three accepted values but says nothing about any other.

## What Changes

- `MEET_BLOB_STORAGE_MODE` values are matched ignoring letter case and surrounding spaces, so `GCS` selects Google Cloud Storage instead of S3.
- Any value other than `s3`, `gcs` or `abs` aborts startup with a non-zero status and an error naming `MEET_BLOB_STORAGE_MODE` and the accepted values. An unset or empty variable keeps selecting `s3`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: a new requirement "Storage mode values", next to "Storage provider selection", states how values are matched and that an unknown value aborts startup.

## Impact

- Surfaces: deployment configuration only. No REST API, webhook, embedded API or UI change; no public contract changes.
- Code: storage mode resolution at backend startup (`environment.ts`, `dependency-injector.config.ts`).
- Upgrade: a deployment whose value is unknown today, and that therefore runs on S3, stops starting until the value is corrected. Every OpenVidu deployment template writes `s3`, `gcs` or `abs`, so installed deployments are not affected.
- openvidu.io: `docs/docs/self-hosting/configuration/reference.md` (`MEET_BLOB_STORAGE_MODE` row: default `s3`, any other value stops startup).

## Decisions to confirm

- Decided (USER, 2026-10-20): values match ignoring case and surrounding spaces. Rejected alternative: exact lowercase only, which would also stop a deployment with `S3` that works today by accident.
- Decided (USER, 2026-10-29): an unknown value is logged with the accepted values and stops startup. Rejected alternative: keep falling back to S3 with a startup warning.
- Decided (USER, 2026-10-29): the fix gets a `Fixed` line only. Rejected alternative: an extra `Upgrade notes` line warning that an unknown value now stops startup.
