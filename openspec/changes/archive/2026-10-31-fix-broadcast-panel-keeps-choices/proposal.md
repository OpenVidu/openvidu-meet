# Proposal

## Why

A moderator who leaves a room destination out of the live broadcast, or adds a destination for the
meeting, loses those choices as soon as the activities panel closes or another panel (chat,
participants, settings) opens. Back in the Live broadcast activity, every room destination is chosen
again and the added ones are gone, while Go live still shows a plausible count, so one click streams to
the channel the moderator had excluded.

## What Changes

- The choices made in the Live broadcast activity are kept for the whole meeting entry, whatever panel
  opens or closes: the room destinations left out, and the destinations added for the meeting with their
  full URLs. They are cleared when the participant leaves the meeting, together with the broadcasts the
  meeting already forgets then.
- The destinations added for the meeting while live are kept the same way, so their rows and their
  Start and Retry actions survive the panel closing.
- What is typed in an open destination editor and not yet added is not kept (see "Decisions to confirm").
- No delta of its own: `live-broadcast` is still being added by `add-live-broadcast`, whose requirement
  "Going live from the activity" ("let the participant leave any out") gets a scenario saying the choice
  holds while the panel is closed and reopened.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task adds the scenario to the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Meeting UI: the Live broadcast activity of the activities panel.
- REST API, webhooks, embedded API, console UI, deployment configuration: not affected.
- Code: `BroadcastStateService` (`.../openvidu-components/services/broadcast/broadcast-state.service.ts`),
  `BroadcastActivityComponent` and the broadcast model of the meeting components, in
  `meet-ce/frontend/projects/shared-meet-components`.
- openvidu.io: none (`docs/meet/features/meetings/live-broadcast.md` already says to clear the
  destinations to leave out and press Go live).
- CE extension seam: none new; the choices live in the injectable `BroadcastStateService`.

## Decisions to confirm

- Where the choices live. Proposed: in `BroadcastStateService`, which outlives the panel, already holds
  the full URLs of the destinations this client gave for the meeting and is reset when the participant
  leaves. Alternative: keep the activities panel alive while hidden, which changes how every panel of
  the meeting is created and destroyed.
- Whether an unsaved draft in the destination editor survives the panel closing. Proposed: no, closing
  the panel discards it, as a cancel would. Alternative: keep the draft (name and full URL) in the state
  service too.
- Whether Start live broadcast in More options follows the choices of the activity. Proposed: no, it
  keeps going live to every room destination not streamed to yet, as "Live broadcast control in More
  options" specifies. Alternative: it goes live to the destinations chosen in the activity, which a
  moderator who excluded a channel there may expect.

## Source

3.10.0 pre-release audit, finding BF-1 (medium, verified-live), introduced by #120.
