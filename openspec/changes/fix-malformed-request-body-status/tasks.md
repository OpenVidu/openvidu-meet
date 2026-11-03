# Tasks

## 1. Answer the parser's status

- [ ] 1.1 In `fromBodyParser` of `meet-ce/backend/src/middlewares/error-handler.middleware.ts`, return an error with the parser error's own status for any error that has `expose: true` and a 4xx status, keeping the `entity.too.large` payload shape, and drop the two-case switch. Verify in `meet-ce/backend/tests/unit/middlewares/error-handler.middleware.test.ts` with a zlib error (`400`), `encoding.unsupported` and `charset.unsupported` (`415`) and a check that no error-level log is written.
- [ ] 1.2 Add a case to the existing request-body integration test (`meet-ce/backend/tests/integration/api/security/`) for the gzip-with-trailing-bytes request (needs the OpenVidu local deployment; report as not run when unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: add under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`: "A request with a body that cannot be decompressed, or with an unsupported encoding or charset, answered `500`. It now answers `400` or `415`."
- [ ] 2.2 openvidu.io: none.
