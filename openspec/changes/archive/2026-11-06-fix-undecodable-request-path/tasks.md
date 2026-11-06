# Tasks

## 1. Answer undecodable paths as a client error

- [x] 1.1 `globalErrorHandler` in `meet-ce/backend/src/middlewares/error-handler.middleware.ts` maps the router's
  `URIError` to `errorMalformedPath()` (`400`, `Bad Request`, `Malformed path`) and logs it at debug level. Covered by
  `tests/unit/middlewares/error-handler.middleware.test.ts` (`%E0%A4%A`, `%ZZ`, `%`, and `%20` still decoding).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: one line under `## 3.10.0 (unreleased)` > `### Fixed` > `#### Integration`, since 3.9.0
  answers `500` too.
- [x] 2.2 openvidu.io: none.
