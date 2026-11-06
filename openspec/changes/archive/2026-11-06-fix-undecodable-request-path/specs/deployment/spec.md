## ADDED Requirements

### Requirement: Undecodable request paths
The server SHALL answer `400` with error `Bad Request` to a request whose path holds a percent escape that does not
decode, such as `%E0%A4%A`, `%ZZ` or a lone `%`, on any route and before checking its credentials, with the JSON
error shape of every error response, and SHALL NOT log it as an unexpected failure.

#### Scenario: Broadcast read with an undecodable identifier
- **WHEN** a client calls `broadcastGet` with the `broadcastId` `%E0%A4%A`
- **THEN** the server answers `400` with error `Bad Request`

#### Scenario: Request without credentials
- **WHEN** a client without credentials calls `GET /api/v1/rooms/%ZZ`
- **THEN** the server answers `400`, not `401` nor `500`

#### Scenario: Well-formed escape
- **WHEN** a client sends a path parameter with the escape `%20`
- **THEN** the server decodes it to a space and handles the request as usual
