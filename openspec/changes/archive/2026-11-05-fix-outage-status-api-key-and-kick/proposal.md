# Proposal

## Why

`authentication` requires `500`, never `401`, when the server cannot check a credential because MongoDB fails. The
API key check still turned a failure to read the stored API keys into "There are no API keys configured yet" with
`401`, so an integrator's backend read an outage as a missing or revoked key. The webhook signer did the same and
reported a missing API key instead of the failure. Likewise, a kick that lost the media server after finding the
participant answered `404` "participant not found": the unreachable check could never see the connection error.

## What Changes

- `ApiKeyService.validateApiKey()` and the webhook signer let a failure to read the API keys propagate, so `withAuth`
  answers `500` and the webhook delivery logs the real error.
- `LiveKitService.participantExists()` reads the participants straight from LiveKit, so the check for an unreachable
  media server sees the connection error again: a kick that loses the media server half-way answers `503`, not `404`.
- No spec change: "A server failure is not an authentication failure" in `authentication` already states it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- REST API: requests with `X-API-Key` answer `500` instead of `401` while MongoDB is unreachable.
- Code: `meet-ce/backend/src/services/api-key.service.ts`, `webhook-dispatcher.service.ts`, `livekit.service.ts`.
- Changelog: the API key case is covered by the existing 3.10.0 Fixed line about credentials that could not be
  checked; the kick gets its own Fixed line.
- openvidu.io: none.
