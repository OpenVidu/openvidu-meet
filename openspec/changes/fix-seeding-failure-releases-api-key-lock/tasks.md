# Tasks

## 1. Release the locks before aborting

- [ ] 1.1 In `initializeStorage` of `meet-ce/backend/src/services/storage/storage-init.service.ts`, replace `Promise.all` over the seeders with `Promise.allSettled` and rethrow the first rejection once all have settled. Verify with a case in `meet-ce/backend/tests/unit/services/storage-init.service.test.ts` where one seeder rejects while another holds a lock: the lock is released before the rejection surfaces.
- [ ] 1.2 In `meet-ce/backend/src/config/internal-config.ts`, set the API key lock attempts and delay so that attempts times delay exceeds `API_KEY_LOCK_TTL`. Verify with a unit assertion of that relation next to the storage init tests.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. The lock is new in 3.10.0 (#130), so there is no earlier release it differs from.
- [ ] 2.2 openvidu.io: none.
