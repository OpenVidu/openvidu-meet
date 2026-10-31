# Tasks

## 1. Always prefix

- [x] 1.1 In `meet-ce/backend/src/utils/storage-key.utils.ts` make `withKeyPrefix` return `${prefix}/${key}` whenever the prefix is non-empty, delete the already-prefixed branch, and adjust the use in `services/storage/blob-storage.service.ts` if it relied on it.
- [x] 1.2 In `meet-ce/backend/tests/unit/services/blob-storage.service.test.ts` delete "leaves a key read back from a listing under its prefix once" and replace `writes where %s reads with the prefix "recordings"` by an assertion of the layout `${prefix}/recordings/...` for `recordings`, `rec` and the default prefix, and for an empty prefix.
- [ ] 1.3 Backend recordings integration tests on S3 stay green (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no new line. The `Fixed` > `Deployment` line "A `MEET_S3_SUBBUCKET` or `MEET_AZURE_SUBCONTAINER_NAME` that begins the recordings path, such as `rec` or `recordings`" becomes true; keep its wording.
- [x] 2.2 openvidu.io: none.
