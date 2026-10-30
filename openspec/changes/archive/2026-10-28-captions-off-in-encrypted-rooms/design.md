# Design

## Context

The recording rule lives in three places: the create schema (`room.schema.ts`, the two `refine`/`transform` blocks that turn `recording.enabled` off when `e2ee.enabled`), `RoomService.updateMeetRoomConfig` (applied to the merged config) and the wizard (`clearRecordingStateBeforeE2EE` and its restore). Captions follow `captions.enabled` everywhere: the meeting hides the button and `createAiAssistant` refuses to start. Rooms are at schema version 7.

## Goals / Non-Goals

**Goals:**
- One rule, applied where the recording rule is applied, so both exclusivities read and test the same way.
- Existing encrypted rooms stop offering a captions button that cannot work.

**Non-Goals:**
- Giving the captions agent the meeting key (it would make encryption pointless against the server operator).
- Changing the deployment switch `MEET_CAPTIONS_ENABLED`.

## Decisions

- **Store the effective value**, as for recording, instead of a runtime-only check: `getRoomConfig` then tells the truth, the meeting and the assistant need no new condition, and both exclusivities share one place in each layer. Runtime-only is listed as the alternative in the proposal's decisions.
- **Same code paths as recording.** The create schema transform and the merged-config step of `updateMeetRoomConfig` turn `captions.enabled` off next to `recording.enabled`; the wizard gets the captions twin of the recording save-and-restore.
- **Migration `room` v7 -> v8.** A forward-only step sets `config.captions.enabled` to `false` where `config.e2ee.enabled` is `true`, bumps `ROOM_SCHEMA_VERSION` to 8 and refreshes its `MIGRATION_REV` (see `meet-ce/backend/src/migrations/README.md`). It runs at startup under the migration lock, so with several replicas exactly one runs it; all replicas run the same version, so no replica writes the old shape afterwards.
- **A meeting already running in an encrypted room with captions on** keeps its state until it ends: config updates are refused during a meeting, and the migration only changes the stored config, which the next meeting reads.

## Risks / Trade-offs

- [An operator who relied on the stored `captions.enabled: true` of an encrypted room sees it change after the upgrade] -> Stated in the changelog line; the setting never produced captions in those rooms.
- [Turning encryption off later does not turn captions back on server-side] -> Same as recording: the API caller sets `captions.enabled` again; the wizard restores the previous toggle for its user.
