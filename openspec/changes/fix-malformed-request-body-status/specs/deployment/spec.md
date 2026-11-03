## ADDED Requirements

### Requirement: Undecodable request bodies
The server SHALL answer `400` to a request body that cannot be decompressed and `415` to a `Content-Encoding` or charset it does not support, with the JSON error shape of every error response, and SHALL NOT log them as unexpected failures.

#### Scenario: Corrupt compressed body
- **WHEN** a client sends a gzip body with trailing bytes and `Content-Encoding: gzip` to `loginUser`
- **THEN** the server answers `400`

#### Scenario: Unsupported encoding
- **WHEN** a client sends a body with `Content-Encoding: x-unknown`
- **THEN** the server answers `415`
