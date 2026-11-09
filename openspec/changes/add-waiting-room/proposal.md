## Why

Anyone holding a room's link enters the meeting at once. Hosts of classes, consultations and public meetings need to see who is asking and decide who comes in, as Jitsi (lobby), BigBlueButton (guest policy), plugNmeet and Whereby (knocking) allow. It is the strongest access-control request after per-link permissions. This is Phase 6 of the parity plan (`../openvidu-competitors/meet-update-plan/phase-specs/phase-06-lobby.md`), with its screens designed on the canvas https://claude.ai/artifact/Hz7n4572sbYAakfrjwt1oa. It replaces the "lock room" plan (`MEET-LOBBY-LOCK-ROOM-PLAN.md`): whoever waits connects to Meet through the realtime channel of `add-realtime-channel`, never to the media server.

## What Changes

- **Room config:** `config.lobby` (`enabled`, `message`), off by default, fixed while a meeting runs like the rest of the config. The meeting has no switch to turn it off.
- **Who waits:** in a room with the waiting room on, a participant without `lobbyBypass` who presses the device setup button, which reads "Ask to join", waits instead of joining.
  - The server answers with a waiting credential, a room member token that LiveKit refuses. Asking does not start the meeting, reserve the name or take a place in the meeting.
  - The participant keeps their place while their meeting client stays in touch with Meet, and for five minutes after losing touch, shown as away.
  - Holders of `lobbyBypass` join directly, and so does a participant already admitted to the running meeting who joins again.
- **Admitting and rejecting:**
  - Admitting lets the participant join without reloading, with the identity they waited with. Admissions take places in the meeting: a holder of `lobbyAdmin` can only admit as many participants as fit, and chooses who takes the free places.
  - An admission that cannot complete puts the participant back in line, in their place.
  - Rejecting tells them they were not let in, and they may ask again after a short pause.
  - Both work one by one or for a set of participants, from the meeting UI, the embedded API and REST.
  - There is no blocking.
- **The meeting is closed to whoever was not let in:** in a room with the waiting room on, only participants admitted to the running meeting, holders of `lobbyBypass` and API keys read the meeting, its participants and its broadcasts, and a participant who reaches the media server without having been admitted is removed.
- **The waiting screen** keeps the camera preview and shows the position in line, the room's message, and whether the host has joined.
- **What `lobbyAdmin` holders see in the meeting:** a "Waiting to join" section at the top of the participants panel with the free places, a status rail chip, and a notification with Deny and Admit while the panel is closed.
- **New public contracts:**
  - REST `lobbyList`, `lobbyResolve` and `lobbyResolveAll` under `/api/v1/meetings/{roomId}/lobby`, with schema `MeetLobbyParticipant`.
  - Webhooks `participantKnocked` and `lobbyStatusChanged`.
  - Embedded commands `lobbyAdmit`, `lobbyReject`, `lobbyAdmitAll` and `lobbyRejectAll`.
  - Embedded events `participantKnocked`, `lobbyUpdated` and `lobbyStatusChanged`.
  - Permissions `lobbyBypass` (join without waiting) and `lobbyAdmin` (list, admit and reject).
- **Console:** the Room Access step of the room wizard gains a Waiting room section (switch and message) and the "Join without waiting" and "Admit participants" permissions.
- **Refactor:** the frontend Join screen pieces named "lobby" (`MeetingLobbyService`, `MeetingLobbyComponent`, the `LOBBY.*` translation keys and the `lobby` test ids) and the lone participant's `MeetingWaitingPanelComponent` are renamed, so "lobby" and "waiting" mean only the waiting room. Each waiting room piece is its own library component.

## Capabilities

### New Capabilities

- `waiting-room`: holding participants until someone admits them, on every surface. It covers:
  - who waits and who bypasses;
  - the waiting list, its order, its limit, and how long a place lasts;
  - admission, its capacity, its failure, rejection, and what ends a wait;
  - who may read a meeting held behind a waiting room;
  - what the waiter and the admitters see;
  - the REST operations, the webhooks, the embedded commands and events, and the wizard section.

### Modified Capabilities

- `permissions`:
  - twenty-four permissions instead of twenty-two;
  - the waiting room permissions;
  - their role defaults and their completion on older data.
- `room-config`: the default config and the switch rule cover `lobby`.
- `meeting-join`: the server's join checks hold a participant back while the waiting room applies to them, and `meetingLeave` leaves the waiting room.
- `meetings`: reading a meeting and its participants follows the waiting room's admission rule.
- `live-broadcast`: reading broadcasts follows the waiting room's admission rule.
- `embedded-api`: the command and event catalogues list the waiting room commands and events, and the media and leave commands run while waiting.
- `webhooks`: the event catalogue lists `participantKnocked` and `lobbyStatusChanged`.

## Impact

- **REST API, additive:**
  - three operations in the meetings group, with schema `MeetLobbyParticipant`;
  - `config.lobby`;
  - permission keys `lobbyBypass` and `lobbyAdmin`;
  - `meetingGet`, `participantList`, `participantGet`, `broadcastList` and `broadcastGet` answer `403` to a room member token that was not admitted, in rooms with the waiting room on (a room with it on cannot exist before this change);
  - the internal `generateRoomMemberToken` can answer with a waiting credential, and a new internal operation returns a waiter's state. The internal API has no compatibility promise.
- **Webhooks, additive:** event types `participantKnocked` and `lobbyStatusChanged`, accepted by the webhook event filters.
- **Embedded API, additive:**
  - four commands;
  - three events, on the web component and the iframe;
  - `mediaToggleAudio`, `mediaToggleVideo` and `meetingLeave` also run while waiting;
  - the frozen embedded API contract test is updated.
- **Meeting UI:** the "Ask to join" button, the waiting, rejected, left, ended and "waiting room full" screens, and the admitters' panel section, rail chip and notification, translated in every supported language.
- **Console UI:** the Waiting room section and the two permissions in the Room Access step.
- **Deployment:**
  - no new variable;
  - schema migrations bump rooms to v10 and room members to v7;
  - needs the realtime channel (`add-realtime-channel`) and its WebSocket path; a waiter whose network blocks it falls back to polling.
- **CE extension seams:** the waiting screen, the outcome screens, the panel section, the rail chip and the notification are separate library components that the meeting composes, so PRO can replace any of them.
- **openvidu.io:**
  - a new feature page, `docs/meet/features/meetings/waiting-room.md`;
  - `docs/meet/features/meetings/configuration.md` (`config.lobby`);
  - `docs/meet/features/rooms/access.md` (`lobbyBypass` and `lobbyAdmin` in the predefined roles);
  - `docs/meet/embedded/reference/webhooks.md` (`participantKnocked`, `lobbyStatusChanged`);
  - the regenerated embedded API and REST API references.

## Decisions taken

USER, 2026-11-06:
- Migration grants the waiting room permissions to the moderator role and to members with that role, as `participantHandLower` did.
- The waiting room cannot be turned off inside a meeting and the room config is not touched. The canvas's in-meeting switch and its "Turn off and admit 3" dialog are dropped; the bulk admit button reads "Admit 3", with the number of people it admits.
- No blocking: "Deny and block" and its dialog are dropped, and the row has no menu.
- The API verb is `reject` (`lobbyReject`, `lobbyRejectAll`, action `reject`); the UI says Deny.
- A waiter's host learns how the wait ended from `lobbyStatusChanged`. `meetingLeft` is not emitted for someone who never joined, and `LeftEventReason.lobby_rejected` is not added. A full meeting behaves the same way (decision #19).
- When the waiting room is turned off while people wait, which is possible only with no meeting running (a wait can start before any host arrives), everyone waiting is let in.

USER, 2026-11-08 (adversarial review of this change):
- The participant asks for their LiveKit token only once admitted; the waiting credential is the Meet credential of the realtime connection, never a LiveKit token.
- Pending admissions count against `maxParticipants`, so the admitter chooses who takes the free places.
- A per-meeting register of admitted participants, ephemeral like every meeting datum: it dies with the meeting. A participant who reaches the media server without being in it is removed, and a kick takes them out of it.
- Nobody who was not admitted reads a meeting held behind a waiting room.
- A second wait of the same identity replaces the first, keeping its place. A page closed or left (`1001`) ends the wait at once.
- A host who loses connection does not end anyone's wait: only an explicit end of the meeting, its duration limit, or closing or deleting the room does.
- A participant given `lobbyAdmin` during the meeting gets the waiting list at once.
- The realtime connection closes once the participant is in the meeting. An admission that fails puts them back in line, in their place, and they reappear in the admitters' list.
- `lobbyResolveAll` and the bulk buttons carry the identities the admitter saw.
- Dead connections are detected with a heartbeat that balances load and state sync (`add-realtime-channel`).
- An outcome webhook (`lobbyStatusChanged`), an embedded `lobbyUpdated` event with the whole list, and `participantKnocked` as the only name of the knock, as event and as webhook (no `lobbyKnocked`, no alias).
- Two permissions: `lobbyBypass` to join without waiting, `lobbyAdmin` to admit.
- The waiting screen says the host has not joined yet instead of "Nobody can let you in yet".
- Sounds for a knock and for an admission are pending, outside this change.

## Decisions to confirm

- `lobbyResolveAll` now requires the identities it acts on, while its name says "all". Keep the name, which mirrors the "Admit all" button, or call it `lobbyResolveMany`.
