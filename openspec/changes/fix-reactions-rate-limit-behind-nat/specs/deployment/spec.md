## MODIFIED Requirements

### Requirement: Rate limiting per client address
The server SHALL limit requests per client IP address, per minute: 1000 for the REST API reference and the embedded bundles, 200 for room member token issuance and 500 for the other API routes, not counting requests with an `X-API-KEY` header nor reactions, which `reactions` limits per participant. The limits on login, token refresh, logout, password changes and API key management are specified in `authentication`. No limit SHALL apply when `NODE_ENV` is `development`, `test` or `ci`.

#### Scenario: Server-to-server traffic is not throttled
- **GIVEN** an integrator backend calling the REST API with its API key from one IP address
- **WHEN** it sends 600 requests within a minute
- **THEN** none is rejected for rate limiting

#### Scenario: Browser traffic over the limit
- **GIVEN** a browser calling API routes with an access token
- **WHEN** it sends a 501st request within a minute
- **THEN** the server answers `429`

#### Scenario: Reactions do not count toward the API limit
- **GIVEN** participants behind one IP address who sent 600 reactions in total within a minute
- **WHEN** a browser at that address sends another API request within that minute
- **THEN** the request is not rejected for rate limiting
