# Proposal

## Why

Downloading a ZIP of more than 50 recordings, two ZIPs of 26 or more at once, or cancelling a large ZIP halfway makes
every later playback, download and ZIP on that server hang until it is restarted. Any user who may download
recordings can trigger it, and the recordings lists now offer ZIP download for up to 100 selected recordings.

## What Changes

- `downloadRecordings` opens the stored recordings one after another while it writes the archive, instead of opening
  all of them before the first byte, and releases every recording it opened when the ZIP ends, fails or is cancelled
  by the client.
- Specs: `recordings` gains the requirement "A ZIP download does not block other downloads".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: adds "A ZIP download does not block other downloads".

## Impact

- REST API: `downloadRecordings` answers the same ZIP, written sequentially (a very large ZIP starts its first byte sooner and is no longer slower to fail). The contract does not change.
- Code: the ZIP archive creation in the recording service and the ZIP route of the recording controller in `meet-ce/backend`.
- Webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- How the recordings are read. Proposed: strictly one at a time (simple, bounded sockets, the archive is a stream anyway). Alternative: a small bounded concurrency (faster for many small files, more code).
- Whether to also set a request timeout on the S3 client so one stalled stream cannot pin a socket forever. Proposed: not in this change. Alternative: add it here.

## Source

3.10.0 pre-release audit, finding RC-3 (high, verified-live), introduced by earlier releases (code unchanged since 3.9.0).
