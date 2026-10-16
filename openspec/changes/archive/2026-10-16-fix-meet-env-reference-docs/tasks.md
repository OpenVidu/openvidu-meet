# Tasks

## 1. `meet.env` reference

- [x] 1.1 ~~Add the rows for `MEET_NAME_ID`, `MEET_BASE_URL` and `MEET_CONFIG_DIR` (a path to an environment file, whose values lose to the environment) to the `meet.env` table of openvidu.io `docs/docs/self-hosting/configuration/reference.md` on `next`; verify each default against `meet-ce/backend/src/environment.ts` and the `deployment` spec.~~ Dropped (USER decision, 2026-10-16): the table keeps only the variables it already listed.
- [x] 1.2 ~~Add the `MEET_MONGO_*` rows listed in the proposal, with `MEET_MONGO_URI` winning over the node list and `MEET_MONGO_ENABLED=false` stopping Meet; verify each default against `meet-ce/backend/src/environment.ts`.~~ Dropped (USER decision, 2026-10-16): the table keeps only the variables it already listed.
- [x] 1.3 Reword `MEET_BLOB_STORAGE_MODE`, `MEET_S3_BUCKET` and `MEET_S3_SUBBUCKET` for `gcs` (bucket variables reused, Application Default Credentials), and add the address and subnet list to `SERVER_TRUST_PROXY`; verify against `gcs.service.ts` (`new Storage()` with no explicit credentials) and the trust proxy parsing in `server.ts`.
- [x] 1.4 Reword the three `MEET_S3_SSE_*` rows as the proposal states; verify that no Meet code path calls `putObject` on the storage providers.
- [x] 1.5 Run the openvidu.io `check-web` validation (convention lint and strict build) and verify it passes; verify that no added text contains the em dash character. check-web: lint without errors, strict build without warnings, no em dash added.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. The change documents behavior the server already had (root `CLAUDE.md`, Changelog).
- [x] 2.2 openvidu.io `docs/docs/self-hosting/configuration/reference.md` on `next`: done by group 1.
