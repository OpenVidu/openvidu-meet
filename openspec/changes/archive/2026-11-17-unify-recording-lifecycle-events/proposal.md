# Proposal

## Decisions

All decided by the user on 2026-11-17; none is open.

- **Public names.** The embedded API reports a recording through `recordingStarted`, `recordingUpdated` and `recordingEnded`, the names its webhooks already have and the same trio a broadcast has.
- **Payload.** Each of the three carries the recording (`MeetRecordingInfo`), as the webhooks of the same names do and as the broadcast events carry the broadcast.
- **When each one fires.** As for a broadcast: `recordingStarted` the first time a participant's embedded element learns of a recording, including on joining a meeting that is being recorded; `recordingUpdated` on each later change while it is in progress; `recordingEnded` with the final state.
- **No deprecated alias.** `recordingStatusChanged` is removed outright. It was added after 3.9.0 and no release ever carried it, so no host application listens to it.
- **Permission.** None: the events reach every participant, as `recordingStatusChanged` did.
- **Left out.** A start or stop the server refuses still reaches the host only as a console error. The broadcast events and every webhook stay as they are.

## Why

The embedded API of the unreleased 3.10.0 reports a recording through one event, `recordingStatusChanged` with `{ recordingId, status }`, while its webhooks report it through `recordingStarted`, `recordingUpdated` and `recordingEnded` carrying the recording, and a broadcast uses that trio on both surfaces. The naming charter (`meet-ce/typings/CLAUDE.md`) gives an event and its webhook the same name, and `recording` is the only module that breaks it. Aligning it is free only before 3.10.0 ships.

## What Changes

- **BREAKING (unreleased)** The embedded event `recordingStatusChanged` is replaced by `recordingStarted`, `recordingUpdated` and `recordingEnded`, each carrying the recording instead of `{ recordingId, status }`.
- A participant joining a meeting that is being recorded receives `recordingStarted` with the recording's current status right after `meetingJoined`, where it received `recordingStatusChanged`.
- The embedded commands `recordingStart` and `recordingStop` keep their behavior; their reference names the new events.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: the embedded recording event becomes the three lifecycle events, and the requirements that name it (embedded recording commands, clean-up of stale recordings) name the new ones.
- `embedded-api`: the event catalogue lists the three events in place of `recordingStatusChanged`.

## Impact

- **Embedded API**: three events added and one removed, breaking only against the unreleased 3.10.0 contract, so no deprecated alias. The webcomponent element and the iframe messages carry the new names. Commands and attributes do not change.
- **Typings**: `EmbeddedEventName`, `EmbeddedEventPayloads` and the event message types in `meet-ce/typings/src/embedded/events.ts`; the TSDoc of `recordingStart` in `commands.ts`; the embedded API contract test.
- **REST API, webhooks, stored data, deployment configuration**: none.
- **Meeting UI and console UI**: none. The recording mark, notices and panels read the same state as before.
- **Test application**: the testapp listens to the three events.
- **Other open changes**: `fix-recording-indicator-after-reconnect`, not implemented yet, names `recordingStatusChanged` in its proposal and delta spec; its text is updated to `recordingEnded`.
- **CHANGELOG.md**: the 3.10.0 entry of the embedded recording commands names the new events, and the fix that mentions the old one is reworded. No new line: the feature is unreleased.
- **openvidu.io** (`next`): `docs/meet/features/recordings/management.md` and the regenerated embedded reference `shared/meet/webcomponent/events.md` and `commands.md`.
- **openvidu-meet-tutorials**: none. No tutorial listens to an embedded recording event; the webhooks tutorial uses the webhooks, which do not change.
- **PRO**: no extension seam needed.
