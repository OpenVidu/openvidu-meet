# Proposal

## Why

The production stage of the Docker image uses `node:24-slim`, a floating tag (Debian slim since the change `chat-history`, Alpine before it), while the builder and the production-dependencies stages pin an exact Node version, the one CI tests. The image ships whatever Node 24 and Debian exist on the day it is built, untested, and rebuilding the tag later gives a different runtime.

## What Changes

- The production stage uses the `slim` variant of the exact Node version the other stages pin, so the version CI tests is the version that ships.
- No spec change: image build only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- Deployment configuration: the image's Node version is fixed and reproducible; no configuration change.
- REST API, webhooks, embedded API, meeting UI, console UI: not affected.
- Code: `meet-ce/docker/Dockerfile` (the production `FROM`).
- openvidu.io: none.

## Decisions to confirm

- Node patch updates. Proposed: pin the exact version and bump it together with CI. Alternative: keep the floating tag to receive Node and Debian patches automatically, at the cost of an untested runtime.

## Source

3.10.0 pre-release audit, finding AU-10 (low, static-high), introduced by earlier releases.
