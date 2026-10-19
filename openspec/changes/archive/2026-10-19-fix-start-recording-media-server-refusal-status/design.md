# Design

## Context

The media server client wraps every failure of the recording start into a generic internal error
(`500`). The recorder reports capacity refusals (CPU, memory, disk, shutting down) with an
"unavailable" code and other refusals with other codes; all of them reach Meet as an error from the
media server API, while an unreachable media server shows up as a connection error. The
only `503` the backend produces today is "LiveKit is not available", raised for connection errors
on other operations.

## Goals / Non-Goals

**Goals:** a refusal or an unreachable media server during the start answers `503`.

**Non-Goals:** retrying the start inside Meet; changing the status of other operations that call
the media server (each one is fixed in its own capability when needed).

## Decisions

- **Map in the media server client, at the start call.** Any error the media server API returns for
  the recording start, and a connection error, become a `503` recording error; anything thrown before
  the call (Meet's own bugs) stays `500`. Classifying by the media server's error code was rejected:
  the codes differ between "no recorder" and "recorder busy" for the same operator-facing meaning,
  and the integrator can do nothing different with them.
- **Lock release is unchanged.** The start already releases the room's recording hold when no
  recording process exists after a failure, so a `503` leaves the room recordable on every replica,
  as "One recording in progress per room across replicas" requires.

## Risks / Trade-offs

- [A media server bug surfaces as `503` instead of `500`] → it is logged at error level with the
  media server's message, so it stays visible to the operator.
