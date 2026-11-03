# Spec Delta

## REMOVED Requirements

### Requirement: Broadcasts need an egress service
**Reason**: Broadcasts no longer need the OpenVidu egress that reports the tag Meet gives a stream URL: they need an egress that reports a stream id, which LiveKit's egress does.
**Migration**: Replaced by "Broadcasts need an egress service that reports stream ids", which keeps the `503` behavior and changes the egress that is required.

## ADDED Requirements

### Requirement: Broadcasts need an egress service that reports stream ids
`broadcastStart` and `broadcastStop` SHALL answer `503` with error `LiveKit Error` when no egress service of the deployment takes the request, starting nothing. Broadcasts need an egress that reports each stream with the id the server gives it: against an egress that does not, `broadcastStart` SHALL answer `500` and withdraw what it added, so nothing streams.

#### Scenario: No egress service running
- **GIVEN** a deployment whose egress service is down
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `503` and no broadcast is in progress

#### Scenario: Egress without stream ids
- **GIVEN** a deployment whose egress service does not report stream ids
- **WHEN** `broadcastStart` is called for a meeting in progress
- **THEN** the REST API answers `500`, no broadcast is in progress and nothing is streamed
