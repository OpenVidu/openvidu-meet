# Tasks

## 1. Storage mode resolution

- [x] 1.1 Normalize `MEET_BLOB_STORAGE_MODE` (trim, lowercase, empty becomes `s3`) where `MEET_ENV` reads it, and make the storage module of `dependency-injector.config.ts` throw an error naming the variable and the accepted values for any other value instead of falling through to S3 (drop the `default:` label on the `s3` case); verify with unit tests in `tests/unit/services/storage-init.service.test.ts` (the storage domain's test file) covering `GCS`, ` abs `, an empty value and `gsc`, matching the `deployment` scenarios "Value in another case", "Unknown value" and "Unset value".
- [x] 1.2 Verify by hand that `MEET_BLOB_STORAGE_MODE=gsc node dist/src/server.js` exits with a non-zero status and the error message before connecting to any storage, and that `logEnvVars()` prints the storage section for `GCS`.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` → `### Fixed` → `#### Deployment` of `CHANGELOG.md`: "An unknown `MEET_BLOB_STORAGE_MODE` value, including `GCS` or `ABS` in capitals, made Meet use S3 storage. Values now match in any case, and any other value stops startup naming the variable."
- [x] 2.2 Update the `MEET_BLOB_STORAGE_MODE` row of openvidu.io `docs/docs/self-hosting/configuration/reference.md` on `next`: default `s3`, case-insensitive, any other value stops startup.
