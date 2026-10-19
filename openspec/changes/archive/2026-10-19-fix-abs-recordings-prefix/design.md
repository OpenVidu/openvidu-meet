# Design

## Context

Each storage provider prefixes its keys itself (`MEET_S3_SUBBUCKET` for S3 and GCS,
`MEET_AZURE_SUBCONTAINER_NAME` for ABS), while the recording service builds the recorder's output
path with `MEET_S3_SUBBUCKET` hard-coded. The recorder writes into its own configured bucket or
container; Meet only chooses the path inside it.

## Goals / Non-Goals

**Goals:** one definition of the storage prefix per mode, used for the recorder's output path and
for every read, list and delete.

**Non-Goals:** moving blobs written before the fix; changing the recorder's own storage
configuration, which the OpenVidu deployment sets.

## Decisions

- **The storage layer owns the prefix.** The blob storage service exposes the full key of a
  recording output path (prefix plus `recordings/{roomId}/{name}`) built by the active provider, and
  the recording service asks it for the recorder's output path instead of reading an environment
  variable. Rejected: a second `if (mode === 'abs')` in the recording service, which would keep two
  sources of truth.
- **Replicas.** The prefix is static configuration and every replica runs the same version and
  environment, so all replicas write and read the same path. No persisted field changes, so no
  migration and no schema version bump.

## Risks / Trade-offs

- [An affected deployment keeps unreadable recordings written before the fix] → they stay under
  `MEET_S3_SUBBUCKET`, where an operator can move them under the Azure prefix by hand.
