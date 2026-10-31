# Proposal

## Why

The in-flight live broadcast change is not ready to merge: its proposal counts five new operations where
the API has four, its task 8.3 is still unchecked, it is not archived, and its delta still says that six
destinations are refused although the server accepts any number. Merged as it is, the specs of `main`
would lack `live-broadcast` or contradict the code.

## What Changes

- This change is the checklist of corrections `add-live-broadcast` needs before PR #120 merges; it does
  not edit `add-live-broadcast` itself, the corrections are made on that change when the PR is prepared.
- Corrections: "five new operations" becomes four (`broadcastStart`, `broadcastList`, `broadcastGet`,
  `broadcastStop`); task 8.3 is run against the rebased branch and ticked; the scenario "Six
  destinations" is deleted from the delta; the change is archived inside the PR with
  `npx openspec validate --all --strict` passing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The fixes are to the artifacts of `add-live-broadcast`.

## Impact

- Documentation of the in-flight change only. REST API, webhooks, embedded API, UIs, deployment
  configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- When the corrections are applied. Proposed: in the PR, just before `/opsx:archive`, after the other
  `fix-broadcast-*` changes have updated the delta. Alternative: now, so the delta is right while they
  are reviewed.

## Source

3.10.0 pre-release audit, findings BB-10 (low, static-high) and BF-11 (low, verified-live), introduced by
#120.
