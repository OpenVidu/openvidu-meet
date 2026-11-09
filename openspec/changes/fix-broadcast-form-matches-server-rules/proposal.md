# Proposal

## Why

The destination form of the room wizard and of the meeting's Live broadcast activity accepts a name made
only of spaces, a URL longer than the server allows, and two destinations with the same stream key, all
of which the server refuses. In the wizard's edit mode the refusal shows only "Invalid request" and the
room page reloads, discarding every change made in the wizard; in the meeting, the same input makes the
whole go-live request fail.

## What Changes

- The name is refused when it is empty once trimmed, with the existing "name required" message.
- The URL is refused beyond 2048 characters, the server's limit, with its own message. The limit becomes
  a typings constant that the server's validation and the form both use, next to the existing name
  maximum.
- A URL whose stream key (what follows the last `/`, without ` live=1`) another destination of the same
  list already has is refused, with its own message. The server's rule and the form use one typings
  helper. The form can only compare the destinations whose full URL it holds: a saved destination is
  served redacted, so a key typed again that matches a saved one is still refused by the server only.
- The wizard's handling of a refused save is unchanged (edit mode shows the server's message and reloads
  the room detail page, as `rooms` "Editing a room in the wizard" specifies).
- No delta of its own: `live-broadcast` is still being added by `add-live-broadcast`, whose requirements
  "Live broadcast in the room wizard" and "Destinations added in the meeting" get a scenario each.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). A task updates the `live-broadcast` delta of `add-live-broadcast`.

## Impact

- Console UI: the destination editor of the wizard's Live broadcast step.
- Meeting UI: the destination editor of the Live broadcast activity.
- REST API: no change in what the server accepts; the 2048-character limit and the stream key rule move
  to shared helpers.
- Typings: two additive exports in `meet-ce/typings/src/database/room-config.ts` (the URL maximum and the
  stream key of a destination URL), each with its TSDoc; not part of the embedded API.
- Webhooks, embedded API, deployment configuration: not affected.
- Code: `DestinationEditor` (`meet-ce/frontend/projects/shared-meet-components/src/lib/shared/utils/broadcast-destination-editor.ts`),
  the wizard step and the activity templates, the rooms and meeting language files, and the backend's
  `broadcast.schema.ts` and `broadcast.helper.ts`.
- openvidu.io: none.

## Decisions to confirm

- Whether the stream key check covers the saved destinations. Proposed: no, only those whose full URL
  the form holds, since saved stream keys never reach the browser. Alternative: serve a fingerprint of
  each saved key so the form can compare, which weakens the rule that stream keys are never served.

## Source

3.10.0 pre-release audit, finding BF-9 (low, verified-live), introduced by #120.
