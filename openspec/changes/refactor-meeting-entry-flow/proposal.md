# Proposal

## Why

The waiting room (`add-waiting-room`) adds a step to the way a participant enters a meeting, and two more callers of the join token request (asking to join, and the request with the ticket once admitted). Soon after, attributes that skip the join screen or the device setup screen are expected, so a host application can put a participant straight into the meeting. The frontend is not shaped for either:

- **The entry flow has no owner.** `MeetingComponent` decides what is on screen from three unrelated signals (`showLobby`, derived from `MeetingLobbyService.accessGranted`; `lobbyState`; `isMeetingLeft`), the meeting view keeps its own phase machine, and both screens are hardcoded: the join screen always shows, and the view always gets `[prejoin]="true"`.
- **One service does three jobs.** `MeetingLobbyService` (512 lines, provided by `MeetingComponent`) is the join screen's view model, the join token request with its error mapping, and the end-to-end encryption of the name. The waiting room needs the request without the screen.
- **The error mapping is written twice.** `RoomAccessService.validateAccess` and `MeetingLobbyService.generateJoinToken` map the same answers of the room member token request to the same error screens, matching the same message fragments.
- **An entry parameter is threaded by hand through eight places:** the `EmbeddedAttribute` enum and `WebComponentPropertyValues` in the typings, the element's inputs, `wcRouteFromAttributes`, `MeetingRoute.params` (a copy of `MeetingEntryParams`), `extractParams`, `extractRoomMeetingParamsGuard`, and `MeetingEntryService.prepare`.
- **Phase checks compare strings.** The embedded command gate accepts device commands when `phase() === 'prejoin'`; the waiting screen needs the same commands, and every such check would have to learn the new phase.
- **Names collide with the waiting room.** The join screen is called "lobby" in code (`MeetingLobbyService`, `MeetingLobbyComponent`, `LOBBY.*` keys, `lobby` test ids) and the lone participant's panel is `MeetingWaitingPanelComponent`.

## What Changes

A refactor of `shared-meet-components`, in two pull requests, with no change a user, an integrator or an operator can observe:

1. **Renames.** The join screen pieces and the lone participant's panel take the names of what they are (design D1), in CE and PRO. This replaces task group 1 of `add-waiting-room`.
2. **Structure:**
   - one entry flow, owned by a component-scoped `MeetingEntryFlowService`, whose steps and skip rules come from one pure function, with both screens on by default (D2);
   - the join token request moves out of the join screen into `JoinTokenService` (D3);
   - one mapping of room member token failures to error screens, shared by the access check and the join (D4);
   - entry parameters read in one place, for the direct link, the iframe and the element alike (D5);
   - the meeting phase answers questions ("is the device preview on?") instead of being compared with strings (D6).

The skip attributes themselves are not added here: they are a later change, which this one reduces to a few lines (design, "How the skip attributes plug in").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Every requirement of `meeting-join`, `meeting-media` and `embedded-api` holds unchanged; the end-to-end suites are the proof.

## Impact

- Code: `meet-ce/frontend/projects/shared-meet-components` (meeting, embedded, rooms and room-members domains), the SPA and web component end-to-end tests and the testapp (test ids), and `meet-pro/frontend/.../app-pro-meeting.component.ts` (the renamed panel).
- PRO: the renamed exports (`MeetingJoinComponent`, `MeetingJoinService`, `MeetingAlonePanelComponent`) and translation keys (`JOIN.*`). A PRO or a deployment that overrides `LOBBY.*` translations needs the same rename.
- REST API, webhooks, embedded API, typings, backend, deployment: not affected.
- `CHANGELOG.md`: none (refactor). openvidu.io: none.

## Decisions taken

- A refactor needs no delta spec; it is recorded as a change with `skip_specs` so `add-waiting-room` can name it as its prerequisite.

## Open questions (for the later skip-attributes change, not this one)

1. **Names of the attributes.** "Lobby" means the waiting room in the industry and, after this change, in Meet's code too, so `skip-lobby` would read as skipping the waiting room, which a client must never decide (`lobbyBypass` is a permission). Recommended: follow the existing `show-language-selector`: `show-join-screen` and `show-device-setup`, on unless set to `false`.
2. **When the join screen cannot be skipped.** It has to show when it has something to ask or tell: no name known, an encryption key missing, the room closed, or no `meetingJoin`. Recommended: the attribute asks to skip it, and the screen still shows in those cases. Open: whether a name remembered from an earlier entry counts as known.
3. **Skipping the device setup screen behind a waiting room.** A waiter sees the waiting screen with its preview whatever the attribute says. Recommended: keep the waiting screen, since the participant needs somewhere to wait.
