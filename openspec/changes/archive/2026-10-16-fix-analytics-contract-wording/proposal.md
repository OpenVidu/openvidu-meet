# Proposal

## Why

The analytics contract misdescribes `getAnalytics`. Its OpenAPI lists only the "token subject no longer exists" `403`, while a signed-in user whose role is not `admin` also gets `403` (insufficient permissions). Both the OpenAPI schema and the `MeetAnalytics` TSDoc describe `totalRooms` and `totalRecordings` as the number "created", while the server counts the rooms and recordings that exist now, so deleted ones are not counted.

## What Changes

- `meet-ce/backend/openapi/analytics/analytics.yaml`: the `403` response points at the shared `forbidden.yaml`, which covers both insufficient permissions and an invalid token subject.
- `meet-ce/backend/openapi/analytics/schemas/meet-analytics.yaml` and `meet-ce/typings/src/analytics.ts`: `totalRooms` and `totalRecordings` are described as the rooms and recordings that currently exist, and `completeRecordings` as the existing recordings whose status is `complete`.

Documentation only: no behavior changes and no changelog line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `console` spec already states this behavior (requirements "Usage analytics endpoint", scenario "Room manager is refused", and "Analytics count the current state"); the contract text is brought in line with it.

## Impact

- Surfaces: the internal REST API reference and the `MeetAnalytics` TSDoc. No wire or type change.
- openvidu.io: none. The internal API and `MeetAnalytics` are not published there.
