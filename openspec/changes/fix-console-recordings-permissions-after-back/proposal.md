# Proposal

## Why

On the console Recordings page, a user who is not an admin loses the permissions of the recordings' rooms after going
back from a recording: the download buttons turn disabled. Loading the next page of the list also disables play, share
and delete on the rows already shown whose rooms are not on the new page.

## What Changes

- The page keeps the user's permissions per room in one cached value that is restored whole on back navigation and
  merged, not rebuilt, when more rows load; the recordings list takes that one value instead of three room lists.
- No spec change: the fix makes the requirement "Console recordings page" of `recordings` hold across back navigation
  and pagination.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). The code is brought in line with `recordings` "Console recordings page".

## Impact

- Console UI: the Recordings page. No contract change.
- Code: the recordings page and the recording lists component of `shared-meet-components` (fewer inputs and signals than today).
- REST API, webhooks, embedded API, meeting UI, deployment configuration: not affected.
- openvidu.io: none.

## Decisions to confirm

- None.

## Source

3.10.0 pre-release audit, finding RC-6 (low, static-high), introduced by earlier releases (3.9.0) and extended by #125.
