# Proposal

## Why

The list endpoints of rooms, room members, recordings and users accept any positive `maxItems` and round it down.
A value below 1, such as `0.5`, became `0`: the server read one item, returned none, and marked the page as
truncated without a `nextPageToken`, so a client paging through the list could neither see an item nor continue.
Found by the backend test audit.

## What Changes

- The four list schemas share one `maxItems` schema (`models/zod-schemas/pagination.schema.ts`) that rounds down and
  keeps the result between 1 and 100, so `0.5` reads as `1`.
- No spec change: the list requirements already describe `maxItems` as the page size, which is at least one item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- REST API: `GET /rooms`, `GET /rooms/{roomId}/members`, `GET /recordings` and `GET /users` with `0 < maxItems < 1`.
- Code: the four request schemas and the new shared schema.
- openvidu.io: none.
