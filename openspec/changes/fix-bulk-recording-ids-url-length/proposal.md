# Proposal

## Why

The 100-id cap on `bulkDeleteRecordings` and `downloadRecordings` was added so long lists stop failing at a proxy, but
100 recording ids are up to about 11 KB of query string, more than the 8 KB request-line limit of a common nginx, and
the console's ZIP link also carries two tokens. Behind such a proxy, selecting many recordings of rooms with long
names still fails before reaching Meet.

## What Changes

- The cap on the ids of `bulkDeleteRecordings` and `downloadRecordings` drops from 100 to 60, sized so the worst-case
  request (95-character ids plus the ZIP link's tokens) stays under 8 KB; `bulkDeleteRooms` keeps 100.
- The recordings lists disable ZIP download and bulk delete beyond 60 selected recordings.
- Specs: `recordings` "Downloading several recordings as a ZIP" and "Deleting recordings in bulk" change 100 to 60.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: "Downloading several recordings as a ZIP" and "Deleting recordings in bulk".

## Impact

- REST API: both operations answer `422` above 60 ids instead of 100. The 100 cap shipped in this same unreleased version, so no released contract narrows. OpenAPI and its text state the new number.
- Console UI and room recordings page: the bulk actions disable beyond 60.
- Code: the cap constants of the backend (`bulkDeleteRooms` stops sharing one), the recording service of `shared-meet-components`.
- Webhooks, embedded API, deployment configuration: not affected.
- openvidu.io: REST API reference regenerated from the OpenAPI.

## Decisions to confirm

- How to keep the request small. Proposed: lower the cap to 60 (no new route, the ZIP stays a plain link). Alternative: send ids in a request body (bulk delete) and a `POST` (ZIP), which removes the limit but turns the ZIP link into a fetch and changes the public API.
- The exact number. Proposed: 60 (110 characters per id with its parameter name, 6.6 KB, leaving room for the tokens); confirm by measuring the worst-case ZIP URL in task 1.1.

## Source

3.10.0 pre-release audit, finding RC-5 (low, static-high), introduced by #125.
