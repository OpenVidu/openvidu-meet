# Proposal

## Why

The mutation tests written for the Zod request schemas found inputs the REST API accepted or reported wrongly:

- `autoDeletionDate` said "must be a positive integer" but accepted `1893456000000.5`.
- A recording ID whose room part is not a valid room ID once sanitized (`!!!--EG_abc--uid1`, or a room part over 100
  characters) passed the format check.
- `bulkDeleteRooms` read a `null` entry of `roomIds` as the room ID `'null'`.
- A missing webhook `url` was reported as "Must be a valid URL" instead of `Required`.
- `true` or the string `"false"` where only the boolean `false` is accepted (`participantMuteAll`, `participantMute`,
  `participantHandLowerAll`) was reported as "Expected 'false', received 'false'".
- `extraFields` and `X-ExtraFields` kept a repeated name, unlike `fields`.

## What Changes

- `autoDeletionDate` must be an integer.
- `nonEmptySanitizedRecordingId` rejects an ID whose room part fails the room ID schema; a whitespace-only ID reports
  only that it is empty.
- `BulkDeleteRoomsReqSchema` coerces numbers to strings and refuses any other non-string entry.
- The webhook `url` keeps the global `Required` for a missing value.
- The `false`-only fields answer "<field> can only be the boolean false".
- `extraFields` uses the shared `fieldListSchema`, which drops repeated names.
- No spec change: these are validation details the specs and the OpenAPI already describe (integers, ID formats,
  booleans).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- REST API: the inputs above now answer `422`, or a clearer `422` message.
- Code: `meet-ce/backend/src/models/zod-schemas/{room,room-member,recording,meeting,webhook}.schema.ts`.
- openvidu.io: none.
