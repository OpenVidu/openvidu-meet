# Proposal

## Why

The `localization` spec says each entry starts in the language the host requested, but the product applies
`language` when the attribute or query parameter is set or changes, not again at each entry. The spec
therefore promises a reset that does not happen: a participant who picks Deutsch on one room's setup screen
stays in German when the host then points the same element at another room.

## What Changes

- The requirement "Language requested by the host" states the decided behavior: `language` applies when it
  is set or changed, removing it restores the stored preference, and a participant's later choice is not
  overridden by another entry with the same value.
- No code change; the maintainer approved this behavior on 2026-10-20.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `localization`: MODIFIED "Language requested by the host".

## Impact

- Embedded API: documentation of existing behavior; no contract change.
- Not affected: REST API, webhooks, meeting UI, console UI, deployment configuration, code.
- openvidu.io: check that the `language` attribute description on the localization page does not say each
  entry restarts in the requested language.

## Decisions to confirm

- Whether a direct link keeps `language` for later in-app entries (console, then another room). Proposed:
  yes, until the parameter changes or is removed, as for the element. Alternative: the direct link applies
  it once, at the first entry of the tab.

## Source

3.10.0 pre-release audit, finding EM-11 (low, static-high), introduced by #135.
