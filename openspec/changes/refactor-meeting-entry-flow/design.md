# Design

## Context

Paths are under `meet-ce/frontend/projects/shared-meet-components/src/lib/` unless stated; lines are those of `main` at `65fda8fa5`.

How a participant enters a meeting today:

1. **Access check.** The route guards `extractRoomMeetingParamsGuard` and `validateRoomMeetingAccessGuard` (`domains/meeting/routes/meeting.routes.ts:17-23`), or `WcMeetingGuard` in the web component (`domains/embedded/guards/wc-route-guards.ts:29-50`), call `MeetingEntryService.prepare` (seeds the contexts from the entry parameters) and `RoomAccessService.validateAccess` (a room member token without `joinMeeting`).
2. **Join screen.** `MeetingComponent` (`domains/meeting/pages/meeting/meeting.component.ts`) provides `MeetingLobbyService`, calls its `initialize()` (room load with a 12 s timeout) and shows `<ov-meeting-lobby>` while `showLobby()` is true (`:65`, `!accessGranted()`). Its own `lobbyState` (`:66`) and `isMeetingLeft` (`:69`) cover the loading, error and left cases (`meeting.component.html:1-16`).
3. **Device setup.** Submitting the join screen (`MeetingLobbyService.submitAccess`, `meeting-lobby.service.ts:257-287`) loads the room config first, so the room's initial media defaults reach the devices (`meeting-join`, "Room defaults reach the device setup screen"), then sets `accessGranted`. `<ov-meeting-view>` mounts with `[prejoin]="true"` (`meeting.component.html:19`). The view's own phase machine (`domains/meeting/openvidu-components/components/meeting-view/meeting-view.component.ts:545-553`) shows the device setup screen, or joins directly when `prejoin` is false, a path that exists but is never used.
4. **Join.** The view calls its `tokenProvider` (`:389`), which is `MeetingLobbyService.generateJoinToken` (`meeting-lobby.service.ts:395-491`): it encrypts the name for end-to-end encryption, sends the correlation fields, remembers a typed name, marks the meeting active, and maps each failure to an error screen (`:433-487`).

Findings:
- `RoomAccessService.validateAccess` (`domains/rooms/services/room-access.service.ts:58-80`) and `generateJoinToken` map the same statuses to the same `NavigationErrorReason`, matching the same message fragments (`'Anonymous access'`, `'Room member'`). The server's error body has only a category name and a message (`meet-ce/backend/src/middlewares/error-handler.middleware.ts:42-47`), so the fragments stay, but in one place.
- The access check never receives `409` or `422`: the server checks the closed room, the capacity and the correlation fields only when joining (`meet-ce/backend/src/services/room-member.service.ts:468-503`), and the access check sends neither `joinMeeting` nor correlation fields.
- `MeetingRoute.params` (`domains/embedded/models/wc-route.model.ts:23-36`) restates `MeetingEntryParams` (`domains/meeting/services/meeting-entry.service.ts:17-40`). The direct link reads them in `extractParams` (`shared/utils/url.utils.ts:61-79`) and `extractRoomMeetingParamsGuard`, the element in `wcRouteFromAttributes` (`domains/embedded/utils/wc-route.utils.ts:51-66`), each with its own boolean handling.
- The embedded command gate accepts device commands before joining only when `phase() === 'prejoin'` (`domains/embedded/services/embedded-command.service.ts:249-252`).
- PRO projects the lone participant's panel by its current name (`meet-pro/frontend/src/app/customization/pages/app-pro-meeting/app-pro-meeting.component.ts:11,21,33`).

## Goals / Non-Goals

**Goals:**
- One owner decides which entry screen is on, from one tested function.
- The join token request usable without the join screen.
- One mapping of token failures to error screens.
- Entry parameters declared once.
- `add-waiting-room` and a later skip-attributes change each touch few, obvious places.
- No observable change, and less code overall.

**Non-Goals:**
- The skip attributes, the waiting room, or any new behavior.
- Machine-readable error codes in the API (an API change).
- Merging the meeting view's phase machine into the entry flow: the view keeps owning devices and the connection.

## Decisions

### D1. Names say what each piece is

| Today | After |
| --- | --- |
| `MeetingLobbyComponent` (`ov-meeting-lobby`) | `MeetingJoinComponent` (`ov-meeting-join`) |
| `MeetingLobbyService` | `MeetingJoinService` (the join screen's view model only, see D3) |
| `LOBBY.*` translation keys | `JOIN.*`, in every locale |
| `lobby` test ids and helper names | `join`, in the SPA and web component end-to-end tests and the testapp |
| `MeetingWaitingPanelComponent` (`ov-meeting-waiting-panel`), its slot and `#waiting-panel` | `MeetingAlonePanelComponent` (`ov-meeting-alone-panel`), `#alone-panel`, in CE and PRO |

"Join screen" and "device setup screen" are the product names (`meeting-join`). After this, "lobby" and "waiting" in code mean only the waiting room. The renames land in their own pull request, before any logic moves, so the second pull request's diff shows only structure.

### D2. One entry flow

`MeetingEntryFlowService`, provided by `MeetingComponent` next to the services it already provides, owns `step`:

| Step | On screen | Left by |
| --- | --- | --- |
| `preparing` | spinner while the room loads | room loaded (`join` or `meeting`), or not (`error`) |
| `join` | join screen | its submit |
| `meeting` | `<ov-meeting-view>`, which runs device setup, connection and the live meeting | the local participant leaving |
| `left` | nothing (the end screen is a route) | |
| `error` | "could not prepare the meeting" | |

- **Skip rules in one pure function.** `joinScreenNeeded(options, state)` in `domains/meeting/utils/meeting-entry-flow.utils.ts` is true when `options.showJoinScreen` is true, or when the screen has something to ask or tell: no name known, an encryption key missing, the room closed, or no `meetingJoin`. `MeetingEntryOptions` is `{ showJoinScreen, showDeviceSetup }`, and this change only uses `DEFAULT_MEETING_ENTRY_OPTIONS`, both `true`, so the flow behaves as today.
- **Leaving `join` loads the room config first.** The "room config before devices" ordering moves from `submitAccess` into the flow's one transition to `meeting`, so a path that skips the join screen gets it too.
- **The view gets the option.** `meeting.component.html` binds `[prejoin]="entryFlow.options().showDeviceSetup"` instead of `true`, and switches on `entryFlow.step()` instead of `showLobby()`, `lobbyState()` and `isMeetingLeft()`, which are removed.
- **The view keeps its phases.** The flow decides which screen comes next; the view runs media and the connection. The waiting room adds its phase to the view, as `add-waiting-room` designs it.

### D3. `JoinTokenService` requests the join token

`generateJoinToken` moves out of the join screen's view model into `JoinTokenService` (`domains/meeting/services/join-token.service.ts`, `@Service()`, no state): `request({ participantName, e2eeKey, nameTypedByParticipant })` encrypts the name, sends the correlation fields from `RoomMemberContextService`, remembers a typed name, marks the meeting active and returns the token; a failure goes to its error screen through D4. `MeetingComponent` hands the view `() => joinToken.request(join.joinRequest())`. `MeetingJoinService` keeps the form, the notices, the back button, the recordings card and the share link, and exposes the request's inputs as `joinRequest()`.

This is the seam the waiting room needs: its answer to a join becomes `{ kind: 'token' } | { kind: 'waiting', lobbyTicket, participantIdentity }`, and its ticket request reuses the same mapping.

### D4. One mapping of token failures

`roomMemberTokenFailure(error): NavigationErrorReason` (`domains/room-members/utils/room-member-token-failure.utils.ts`), a pure function covering every status either caller handles today: `400` invalid link; `403` anonymous access disabled or forbidden; `404` invalid member or invalid room; `409` meeting full or closed room; `422` invalid participant data; `429` too many requests; anything else internal error. `RoomAccessService.validateAccess` and `JoinTokenService` both call it. For the access check the result is the same as today, since it never receives `409` or `422` (Context). The console log of the server's `422` details stays in `JoinTokenService`.

### D5. Entry parameters declared once

- `readMeetingEntryParams(roomId, read)` (`domains/meeting/utils/meeting-entry-params.utils.ts`) builds `MeetingEntryParams` from a `read(attribute: EmbeddedAttribute)` that returns the raw value: a query parameter string for the direct link and the iframe, the element's input value for the web component. It applies the `embedded-api` boolean rule once (absent: no opinion; `false` or `"false"`: false; any other present value: true).
- `extractRoomMeetingParamsGuard` and `wcRouteFromAttributes` both call it; `MeetingRoute.params` becomes `MeetingEntryParams`; `extractParams` keeps only what the recordings and language guards read (`roomId`, `secret`, `language`, `showLanguageSelector`).
- A new entry attribute then takes: the enum value and the property with its TSDoc in the typings, the element's input (Angular Elements needs one per property), one line in `readMeetingEntryParams`, the `MeetingEntryParams` field and its use in `prepare`. No adapter can miss it, since both read through the same function.

### D6. The phase answers questions

`MeetingPhaseService` gains `isPreviewing`, true while the device setup screen shows the local preview (`phase() === 'prejoin'` today). The embedded command gate reads it instead of comparing the phase. The waiting room adds its phase to `isPreviewing` and nothing else changes for commands. The view's own template keeps its phase comparisons, since it owns the phases.

## How the skip attributes plug in

The later change (its own OpenSpec change, with delta specs for `meeting-join` and `embedded-api`) does:

1. The typings: two `EmbeddedAttribute` values with their properties and TSDoc (names: proposal, open question 1).
2. The element: two inputs.
3. `readMeetingEntryParams`: two lines; `MeetingEntryParams`: two fields; `prepare`: hands them to the flow as `MeetingEntryOptions`.
4. `joinScreenNeeded` already holds the fallback rules (open question 2 may refine "name known").
5. The view already joins directly when `prejoin` is false.
6. The delta specs, the embedded API contract test, the changelog and openvidu.io, as for any attribute.

## How the waiting room plugs in

- `JoinTokenService.request` returns the `202` as a `waiting` answer (D3); the ticket request uses the same service and mapping (D4).
- `MeetingJoinService` computes whether the participant would wait (the room's `lobby.enabled` and no `lobbyBypass`), and the join screen's button reads "Ask to join".
- The flow sends a participant who would wait straight to the request once the join screen is done or skipped, and the view opens in its `waiting` phase.
- `isPreviewing` includes `waiting` (D6).

## Risks / Trade-offs

- [A behavior slips in while moving code] → Two pull requests (renames, then structure); the moved Karma specs of `meeting-lobby.service.spec.ts` keep their cases; the SPA and web component end-to-end suites that walk the join screen run on both.
- [Overridden `LOBBY.*` translations stop applying in a deployment or in PRO] → Stated in the pull request; the rename is mechanical.
- [The options object exists before any attribute sets it] → It is the seam the next change fills, two fields with constant defaults; `joinScreenNeeded` is tested with both values now, so the fallback rules are fixed before the attributes exist.

## Migration Plan

None: no data, configuration or contract changes.
