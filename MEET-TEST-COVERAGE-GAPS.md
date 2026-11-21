# Meet test coverage gaps (audit of 2026-11-19)

Every scenario of `openspec/specs/` (26 capabilities, about 1,500 scenarios) was compared with the unit,
integration and e2e suites, looking for behavior a spec requires and no test asserts. Four read-only agents did the
comparison; their verdicts were then checked row by row by whoever wrote each test, and several turned out to be
covered already. Treat a row below as a lead to verify, not as a fact.

## What is already closed

- **Backend rows of high and medium value** (unit and integration): PR #268, 40 tests. Left out there: rate limit
  wiring per route (rate limiting is bypassed under `NODE_ENV=test`), the 20 s meeting timers, a media server
  refusing a data message from a modified client.
- **Library unit rows of high and medium value** (Karma) and four e2e rows: PR #270, about 85 Karma cases and
  3 e2e tests. Left out there because the component has no spec yet: the login throttling message, the webhook
  editor dialog, the console configuration page (base change keeps edited colors), the chat panel (Enter sends,
  500-character limit), the disabled media buttons during a reconnect, the waiting participants status chip, a
  screen share stopped from the browser's own control, the theme overriding the participant preference in
  `meeting.component`.
- **A product bug the audit uncovered**: PR #267 (an access update corrupted every access link of the room).
- **Console e2e rows** (authentication, users, rooms, room-members, recordings, webhooks, appearance, console,
  localization, room-access L195): PR #273, 71 tests in a new Playwright project `console` with its own CI suite
  `console-e2e`. Skipped there because Karma already asserts them: console L11-17/L37-51, authentication L343,
  users L340, room-members L597, rooms L484. Found there: the API key section showed no generation date while
  `authentication` "Generating the first key" requires it; the Embedded page shows it now and its e2e tests assert it.

## What stays open

- **E2E rows of medium value of the meeting, about 35** (the console ones are closed by PR #273): end screen text
  per reason, access error screens, pinning and docked layout, late joiners (chat, reactions), direct link, element
  replaced or room changed during a meeting. Each new e2e test costs CI time, so these are a decision: which
  flows deserve one.
- **Rows of low value, about 120.** Not looked at further.
- **Spec wording**: closed. The permission keys are `participantSendReaction` and `participantLowerHand`; the
  delta specs of the open changes `fix-reactions-rate-limit-behind-nat` and `fix-hand-raise-with-other-room-token`
  named them as the embedded commands, and now use the keys.
- **Known, already tracked**: rate limits count per replica while the `deployment` spec says per cluster
  (baseline finding 8, change `fix-rate-limits-across-replicas`).

## The audit tables

Columns: spec line, scenario or rule, PARTIAL or UNCOVERED, what is missing, nearest existing test, cheapest level
and file where the test belongs, value. Rows closed by the pull requests above are still listed, and their value column says which pull request closed them.


## From `gaps-access.md`

Read-only audit. Spec lines refer to `openspec/specs/<capability>/spec.md`. Test paths are relative to
`meet-ce/` (backend integration: `backend/tests/integration/api/...`, unit: `backend/tests/unit/...`,
SPA e2e: `frontend/e2e/...`, library: `frontend/projects/shared-meet-components/src/lib/...`).
Multi-replica scenarios (two Meet replicas) have no test anywhere in the repo that starts two replicas; they are
listed once per capability as a block, value low unless the single-process variant is also missing.
Not reported: scenarios whose WHEN and every THEN clause are asserted.

Columns: spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value

### authentication (63 scenarios, 32 requirements)

| spec line | scenario or rule | status | what is missing | nearest existing test | where the test belongs | value |
|---|---|---|---|---|---|---|
| 14 | Token header without prefix | PARTIAL | `Authorization: <token>` (no `Bearer `) for an access token is never sent; only the room member header (AI assistant, refresh) and the bare `accessToken` query param are tested | integration/api/security/room-members-security.test.ts:817 | integration, backend/tests/integration/api/auth/token-validation.test.ts (Access Token Tests) | medium (closed in #268) |
| 19 | API key with a prefix (`X-API-KEY: Bearer <key>` -> 401 `Invalid API key`) | UNCOVERED | nothing sends the prefixed key | unit/middlewares/auth.middleware.test.ts:701 (apiKeyValidator) | unit, backend/tests/unit/middlewares/auth.middleware.test.ts (apiKeyValidator) | medium (closed in #268) |
| 32 | Refresh token in the URL (-> 400 `No refresh token provided`) | UNCOVERED | refresh token only as query param is never tried | integration/api/auth/refresh-token.test.ts:92 | integration, backend/tests/integration/api/auth/refresh-token.test.ts | low |
| 43 | API key on an endpoint that does not take it (`getApiKeys`, `getMe` -> 401) | UNCOVERED | api-key-security tests only use access tokens; user-security has no API key on `getMe` | integration/api/security/api-key-security.test.ts:61 | integration, backend/tests/integration/api/security/api-key-security.test.ts (+ get-profile.test.ts for getMe) | high (the API key must never manage API keys) (closed in #268) |
| 211 | Refresh after a role change (refresh token still works, 200, new access token accepted with the new role) | UNCOVERED | only the access-token rejection is tested, never the refresh that follows | integration/api/auth/token-validation.test.ts:143 | integration, backend/tests/integration/api/auth/refresh-token.test.ts | high (logged-in user after promotion/demotion) (closed in #268) |
| 242 | Room locked invalidates room member tokens (`updateRoomAccess` with `lock.enabled` true, then `getRoom` -> 401) | UNCOVERED | the generic "access updated" case is tested, the lock case is not | integration/api/auth/token-validation.test.ts:557 | integration, backend/tests/integration/api/auth/token-validation.test.ts (Room Member Token Tests) | medium |
| 248 | Lock message changed alone also rejects the token | UNCOVERED | message-only update never checked against token validity | integration/api/auth/token-validation.test.ts:557 | same file | medium |
| 321/329 | Login rate limit across replicas; spec `deployment` says every limit counts across the cluster | UNCOVERED | no test; code uses per-process memory stores (see product-bug note in the final message) | unit/middlewares/rate-limit.middleware.test.ts:42 | unit, same file once the store is shared | high (security) |
| 335/337 | Rate limits on sensitive actions: refresh+logout share one bucket of 30/min, `createApiKey/getApiKeys/deleteApiKeys/resetUserPassword/changeUserPassword` share 20/5min | PARTIAL | each limiter is exercised alone; nothing asserts which routes use which limiter (`auth.routes.ts:13-14`, `api-key.routes.ts:11`, `user.routes.ts:54,82`) nor that API-key requests count | unit/middlewares/rate-limit.middleware.test.ts:99 | unit, same file (mount the real routers under NODE_ENV=production) | medium |
| 343 | Console: signed-in user opening the login page is sent to the console; pending password change goes to the change page | UNCOVERED (first part), PARTIAL (second: only used as setup by `authenticate`) | no e2e of either redirect | frontend/e2e/helpers/auth.helper.ts:39 | SPA e2e, frontend/e2e/console.test.ts | medium (closed in #270) |
| 345 | Console deep link while signed out opens the requested console page after login | UNCOVERED | only meeting entry links log in (access.test.ts), no console page | frontend/e2e/access.test.ts:186 | SPA e2e, frontend/e2e/console.test.ts | medium (closed in #273) |
| 350 | Console too many attempts shows the throttling message, not the invalid-credentials one | UNCOVERED | no spec or e2e of `login.component` (it has no spec file) | none | library unit, domains/auth/pages/login (new spec belongs next to the component) or console.test.ts | medium (closed in #273) |
| 362 | Console: every token expired returns to login and back to the page | PARTIAL | covered for meeting and recording views, not for a console page (`Console` describe has only the two concurrent-renewal tests) | frontend/e2e/token-refresh.test.ts:497 | SPA e2e, frontend/e2e/token-refresh.test.ts (Console describe) | medium (closed in #273) |
| 380 | Console logout (button calls `logoutUser`, tokens discarded, login page shown) | UNCOVERED | no test clicks the toolbar logout | frontend/e2e/helpers/token-refresh.helper.ts:212 (only stubs the endpoint) | SPA e2e, frontend/e2e/console.test.ts | medium (closed in #273) |
| 388 | Console API key section (generate, masked/reveal/copy, regenerate, revoke) | UNCOVERED | `embedded.component` has no spec and no e2e | none | SPA e2e, frontend/e2e/console.test.ts | medium (closed in #273 (the generation date is shown since the change that follows it)) |

Infra-only (not reported as gaps, single-process variant is covered): 160 same refresh token on two replicas, 196 logout on another replica, 205 role changed on another replica, 273 demoted on another replica, 286 two replicas regenerate the key, 316 two replicas start, 336 token on another replica.

Counts: authentication: 63 scenarios, PARTIAL 3 (L14, L337, L362), UNCOVERED 11 (L19, L32, L43, L211, L242, L248, L329, L345, L350, L380, L388) plus rule L343.

### permissions (58 scenarios, 26 requirements)

| spec line | scenario or rule | status | what is missing | nearest existing test | where the test belongs | value |
|---|---|---|---|---|---|---|
| 94-99 | Default moderator: grants all 24 permissions | PARTIAL | only `accessBypassLock`/`waitingParticipantAdmin` asserted on a default room; no test lists all 24 keys true | integration/api/rooms/update-room-roles.test.ts:184 | integration, backend/tests/integration/api/rooms/create-room.test.ts (xExtraFields roles) | high (default of every room) (closed in #268) |
| 101-106 | Default speaker: exactly the 12 granted and 12 denied | PARTIAL | same as above | integration/api/rooms/update-room-roles.test.ts:184 | same file | high (closed in #268) |
| 177 | Owner beyond the moderator role (role denies `recordingDelete`, owner deletes -> 200) | UNCOVERED | owner tests run with default roles; admin/owner bypass when the role set denies is never exercised | integration/api/security/recording-security.test.ts:559 | integration, backend/tests/integration/api/security/recording-security.test.ts (Delete Recording) | high (security) (closed in #268) |
| 182 | Integrator with the API key kicks a participant although roles deny `participantKick` to everyone | UNCOVERED | API-key kick runs on default roles | integration/api/security/meeting-security.test.ts:293 | integration, same file | medium (closed in #268) |
| 14 | Unknown key ignored on `updateRoomMember` (200, stored `recordingControl` and its twin `canRecord`, nothing about `canFly`) | PARTIAL | unit only (schema drop); no integration through `updateRoomMember` | unit/permission-schemas.test.ts:127 | integration, backend/tests/integration/api/room-members/update-room-member.test.ts | low |
| 306-308 | One spelling edited (member echo with `recordingControl` false and `canRecord` true -> 422, member unchanged) | PARTIAL | contradiction proven for roles (`permission-naming.test.ts:136`), not through `updateRoomMember` and not that the member stays unchanged | integration/api/rooms/permission-naming.test.ts:136 | integration, update-room-member.test.ts | medium (integrators echo what they read) |
| 164-167 | Moderator token issued by 3.9.0 calls `broadcastStart` -> 403 | PARTIAL | only the default-deny of the missing key is unit-tested, no token minted without `broadcastControl` hits the endpoint | unit/typings/entity-fields/permission-aliases.test.ts:269 | integration, backend/tests/integration/api/rooms/permission-naming.test.ts (Tokens minted with deprecated keys) | low |
| 169-172 | Moderator token from 3.9.0 calls `waitingParticipantList` -> 403 | PARTIAL | same | unit/typings/entity-fields/permission-aliases.test.ts:252 | same file | low |
| 357-360 | Token issued by 3.8.0 with `canRetrieveRecordings` lists the room's recordings | PARTIAL | deprecated-keyed token only asserted on `getRoom` | integration/api/rooms/permission-naming.test.ts:270 | same file | low |
| 220-223 | Chat write denied: media server refuses a data message from a modified client | PARTIAL | token grant (`canPublishData`) asserted, the actual refusal and "nobody receives it" never | integration/api/room-members/generate-room-member-token.test.ts:540 | integration with LiveKit, generate-room-member-token.test.ts | medium |
| 225-228 | Screen share denied: media server refuses the screen track | PARTIAL | `canPublishSources` for screen not asserted per permission | unit/services/room-member-grant.test.ts:46 | unit, backend/tests/unit/services/room-member-grant.test.ts | medium |
| 243-247 | Client that ignores the renewal request: grant stays denied after reconnect with a refreshed token | PARTIAL | live revoke and refresh covered separately, the reconnect-after-refresh sequence is not | integration/api/room-members/generate-room-member-token.test.ts:1053 | integration, same file | low |
| 396-399 | Revoked chat and camera stay revoked after reconnecting with the pre-update token | PARTIAL | session removal asserted, "neither data nor camera accepted from it" is not | integration/api/room-members/update-room-member.test.ts:462 | integration, same file | low |

Infra-only: 249 change handled by another replica, 406 join processed by another replica.

Counts: permissions: 58 scenarios, PARTIAL 11 (L14, L97/L104 counted as 2, L164, L169, L220, L225, L243, L306, L357, L396 grouped), UNCOVERED 2 (L177, L182). Exact: PARTIAL 12, UNCOVERED 2.

### room-access (39 scenarios, 14 requirements)

| spec line | scenario or rule | status | what is missing | nearest existing test | where the test belongs | value |
|---|---|---|---|---|---|---|
| 20 | Links survive access changes (disable then enable speaker link, every URL equals the creation URL) | UNCOVERED | `update-room-access-config.test.ts` never reads `url` | integration/api/rooms/update-room-access-config.test.ts:53 | integration, same file | medium (closed in #267) |
| 75 | Link enabled again: same URL works and enters with speaker permissions | PARTIAL | the test re-enables but never asks a token with the old secret afterwards | integration/api/room-members/generate-room-member-token.test.ts:225 | integration, same file (after the re-enable at :238) | medium (closed in #268) |
| 95 | Owner with restricted roles holds every permission (moderator role lacks `recordingControl`) | UNCOVERED | owner token tested only with default roles | integration/api/room-members/generate-room-member-token.test.ts:348 | integration, same file | high (closed in #268) |
| 131 | Room role permissions at creation: `roles.speaker.permissions {recordingControl:true}` keeps the other speaker defaults and the default moderator set; `roles.moderator.permissions.chatWrite:"yes"` -> 422 | UNCOVERED | no create-room test sends `roles` (schema-level only) | unit/models/room-request-schemas.test.ts:405 | integration, backend/tests/integration/api/rooms/create-room.test.ts | high (closed in #268) |
| 217-249 | Sharing from the meeting: embedded meeting (webcomponent/iframe) never offers the speaker link, shows "waiting for others" | UNCOVERED | share-link.test.ts is standalone-only; no webcomponent e2e | frontend/e2e/share-link.test.ts:93 | webcomponent e2e, frontend/webcomponent/tests/e2e/room.test.ts | medium |
| 195 | Console share dialog copies the speaker link from the Rooms page | UNCOVERED | spec of the dialog covers URL generation only; no e2e from the list | frontend/projects/shared-meet-components/src/lib/domains/rooms/components/room-share-dialog/room-share-dialog.component.spec.ts:90 | SPA e2e, frontend/e2e/console.test.ts | low (closed in #273) |
| 200 | Disabled anonymous link: cannot be chosen, shortcut opens Room Access step | UNCOVERED | dialog spec keeps the disabled link visible and not selectable (:75), the wizard shortcut is untested | room-share-dialog.component.spec.ts:75 | library unit, same spec | low |
| 211-214 | User given only the speaker link sees user and speaker links, no moderator | PARTIAL | dialog spec has the no-moderator case (:63) but not the user-given-speaker-only combination with the list action hidden when none | room-share-dialog.component.spec.ts:63 | library unit, same spec | low |

Infra-only: none.

Counts: room-access: 39 scenarios, PARTIAL 2 (L75, L211), UNCOVERED 5 (L20, L95, L131, L195/L200 as 2 console, L217-249 embedded counted as 1 rule): UNCOVERED 5 scenarios (L20, L95, L131, L200, L246) plus L195 and the embedded scenario L246 counted once; total gaps 7.

### room-members (112 scenarios, 34 requirements)

| spec line | scenario or rule | status | what is missing | nearest existing test | where the test belongs | value |
|---|---|---|---|---|---|---|
| 521-532 | Change still in progress: participant held by another change > 3 s -> 409 `already being updated` (`errorParticipantUpdateInProgress`, room-member.service.ts:1337) | UNCOVERED | no test of the 409 branch | unit/services/room-member-permissions.test.ts:459 (lock describe) | unit, backend/tests/unit/services/room-member-permissions.test.ts | medium (closed in #268) |
| 249-252 | Request not delivered: update still answers 200 when the signal fails | PARTIAL | unit says delivery failure must not fail (frontend-event.service.test.ts:15) but `updateRoomMember` integration never forces a failure | unit/services/frontend-event.service.test.ts:15 | unit, backend/tests/unit/services/room-member-permissions.test.ts or integration update-room-member.test.ts:389 | medium (closed in #268) |
| 216-221 | Update with empty body: guest gets no "permissions updated" notice | PARTIAL | tokens still valid is asserted (:306), the absence of the signal is not | integration/api/room-members/update-room-member.test.ts:306 | integration, same file | low |
| 227-234 | Losing `meetingJoin`: guest leaves with reason `participant_kicked`, new join token with their link -> 403 | PARTIAL | kick asserted (:357); reason and the 403 on the personal link are not | integration/api/room-members/update-room-member.test.ts:357 | integration, same file | medium (closed in #268) |
| 275-278 | Delete member in meeting: user leaves with reason `participant_kicked` | PARTIAL | kick asserted, reason not | integration/api/room-members/delete-room-member.test.ts:99 | integration, same file | low |
| 293-298 | Bulk delete: each failure carries `Room member not found` | PARTIAL | `failed` message text not asserted | integration/api/room-members/bulk-delete-room-members.test.ts:145 | integration, same file | low |
| 451-454 | Tokens that do not join: closed room, recording link token lists and plays recordings | UNCOVERED | closed-room refusal of join is tested (:848), the non-join token during closed status is not | integration/api/room-members/generate-room-member-token.test.ts:848 | integration, same file | high (rooms closed after a meeting keep their recordings) |
| 339 | Identified guest link returns token bound to that member (200) | PARTIAL | covered for access; "bound to that member" (member id in token) not asserted | integration/api/room-members/generate-room-member-token.test.ts:403 | integration, same file | low |
| 436-441 | Encrypted room: join under the encrypted name given | COVERED | (listed for completeness: :922) | | | |
| 535-561 | Meeting keeps its token current: renewal shortly before expiry (meeting longer than token lifetime) | UNCOVERED | retries and 401 recovery are unit-tested; the scheduling of the renewal before expiry is not | frontend/projects/shared-meet-components/src/lib/domains/room-members/services/room-member-context.service.spec.ts:81 | library unit, same spec | medium (closed in #270) |
| 561 | Access withdrawn while notice missed -> "Room access revoked" screen | PARTIAL | unit asserts error page for 403 (:104); no e2e of the revoked screen after a role change | frontend/e2e/permissions.test.ts:649 | covered by e2e for admin demotion; low | low |
| 566 | Recovery from an outdated token while browsing recordings (roles updated) | UNCOVERED | handler unit-tested; no e2e where the manager updates roles and the visitor opens another recording | frontend/e2e/token-refresh.test.ts:403 | SPA e2e, frontend/e2e/token-refresh.test.ts (recordings views) | medium |
| 574-582 | Console Room Members tab: copy guest link clipboard value; tab hidden for non-manager | UNCOVERED | e2e only checks the copy notice language (:289) and that the tab renders (:247); no clipboard value, no "no tab for a non-owner member" | frontend/e2e/console.test.ts:289 | SPA e2e, frontend/e2e/console.test.ts | medium (closed in #273) |
| 584-595 | Console member deletion: confirmation warns about the ongoing meeting; bulk partial report "2 removed, 1 could not" | UNCOVERED | no test | frontend/e2e/console.test.ts:400 (rooms bulk delete only) | SPA e2e, console.test.ts | medium (closed in #273) |
| 597-606 | Console member form: admin and owner shown disabled with reason; edit keeps type and name read-only | UNCOVERED | member-form.component.spec covers only the Locked room group | member-form.component.spec.ts:58 | library unit, same spec | medium (closed in #270) |
| 608-635 | Console permission toggles: only differences sent as `customPermissions`, empty object when edited back to the role, role change resets toggles, `chatWrite` disabled and on after switching moderator->speaker | PARTIAL | dependent toggles tested (permission-dependencies.spec.ts, console.test.ts:262), payload computation and role-change reset not | frontend/projects/shared-meet-components/src/lib/domains/room-members/components/member-form/member-form.component.spec.ts:70 | library unit, same spec | high (wrong payload silently overrides roles) (closed in #273) |
| 637-643 | Members queued in the wizard are added after creation; failed ones named in a warning | UNCOVERED | no test | none | SPA e2e, frontend/e2e/room-wizard.test.ts | medium (closed in #273) |
| 645-658 | Guest links before 3.10.0: reading the member returns the same `accessUrl`; removing and re-adding closes the old link (404) | PARTIAL | memberId-as-secret accepted (:460) and migration doc test; the re-add closing the old secret is not asserted | integration/api/room-members/generate-room-member-token.test.ts:460 | integration, same file | low |

Infra-only: 287 two replicas delete the same member (single-process concurrency covered by lost-race-not-found.test.ts), 514 change through another replica, 523 refresh and promotion on two replicas.

Counts: room-members: 112 scenarios, PARTIAL 9 (L249, L216, L227, L275, L293, L339, L561, L608, L645), UNCOVERED 7 (L521, L451, L535, L566, L574, L584, L597, L637 = 8). Exact: PARTIAL 9, UNCOVERED 8.

### users (63 scenarios, 28 requirements)

| spec line | scenario or rule | status | what is missing | nearest existing test | where the test belongs | value |
|---|---|---|---|---|---|---|
| 212-216 | Same role: 200, `roleUpdatedAt` unchanged, the user's tokens stay valid | UNCOVERED | no "same role" test | integration/api/users/update-user-role.test.ts:93 | integration, same file | high (an admin re-saving a role must not log the user out) (closed in #268) |
| 193-198 | Password reset: tokens held before the reset reach only `getMe` and `changeUserPassword` | UNCOVERED | reset test asserts login and `mustChangePassword`, never the earlier tokens | integration/api/users/reset-user-password.test.ts:43 | integration, same file | high (security) |
| 14-18 | Unknown role on `createUser`/`updateUserRole` -> 422 naming `role`, nothing changed | PARTIAL | 422 asserted (create-user.test.ts:272, update-user-role.test.ts:366), "no account created or changed" not | integration/api/users/update-user-role.test.ts:366 | integration, same files | low |
| 408-420 | `isRootAdmin` on `createUser`, `updateUserRole`, `getMe` responses; `admin` is false after the root id changed | PARTIAL | asserted on `getUser`/`getUsers` only | integration/api/users/get-user.test.ts:29 | integration, get-profile.test.ts, create-user.test.ts | low |
| 288-309 | Root admin bootstrap: password variable changed later does not change the password; root id changed creates a new root and keeps `admin` as an ordinary admin | PARTIAL | unit covers the validation and the seeding guard (storage-init.service.test.ts:115); the restart-with-new-id outcome is not asserted | unit/services/storage-init.service.test.ts:138 | unit, same file | low |
| 340-356 | Console Users page: non-admin typed address redirected to rooms; protected rows | PARTIAL | protected rows covered (console.test.ts:178); the redirect for `room_manager` has no test (no guard spec) | frontend/e2e/console.test.ts:178 | SPA e2e, console.test.ts | medium (closed in #270) |
| 358-365 | Console user actions: create (role `room_manager` preselected, generator, copy), role dialog warnings, reset with generated password, bulk delete failures notice | PARTIAL | only delete and bulk delete rooms/users notices exist | frontend/e2e/console.test.ts:167 | SPA e2e, console.test.ts | medium (closed in #273) |
| 367-378 | Console profile pages: wrong current password marked, new equals current rejected, `room_manager` sees no actions on another profile | UNCOVERED | e2e only covers a successful change (:323) | frontend/e2e/console.test.ts:323 | SPA e2e, console.test.ts | medium (closed in #273) |
| 380-387 | Console forced password change: page asked, other pages blocked, continues to requested page | PARTIAL | the flow is the setup of `authenticate`, "other pages out of reach until success" and "originally requested page" never asserted | frontend/e2e/helpers/auth.helper.ts:39 | SPA e2e, console.test.ts | medium (closed in #273) |
| 236-243 | Role change during a meeting: user stays and sees a notice | PARTIAL | server signal covered (update-user-role.test.ts:295); user-visible notice and "stays with every admin permission" covered by e2e permissions.test.ts:677 | COVERED enough | | |

Infra-only: 77 simultaneous creation on two replicas (single-process race covered at create-user.test.ts:152), 166 password change on another replica, 277 two replicas delete, 300 two replicas start.

Counts: users: 63 scenarios, PARTIAL 6 (L14, L288, L340, L358, L380, L408), UNCOVERED 3 (L193, L212, L367).

### rooms (99 scenarios, 31 requirements)

| spec line | scenario or rule | status | what is missing | nearest existing test | where the test belongs | value |
|---|---|---|---|---|---|---|
| 12-19 | Room manager creates a room: `Location` header points to `/api/v1/rooms/{roomId}` | UNCOVERED | no test reads the header on `createRoom` (users and members do) | integration/api/rooms/create-room.test.ts:43 | integration, same file | medium (integrators follow Location) (closed in #268) |
| 52-55 | Two rooms with the same name get different `roomId` | UNCOVERED | no test | integration/api/rooms/create-room.test.ts:43 | integration, same file | low |
| 216-224 | Close an idle room: its recordings can still be listed and played | UNCOVERED | join refusal asserted (generate-room-member-token.test.ts:848), recordings after close not | integration/api/rooms/update-room-status.test.ts:49 | integration, same file | high (closed in #268) |
| 402-404 | Policy without a date is discarded | UNCOVERED | no `autoDeletionPolicy` without a date test | integration/api/rooms/create-room.test.ts:106 | integration, same file | low |
| 409-412 | Joining after the date and before the sweep enters normally | UNCOVERED | no test | integration/api/rooms/expired-rooms-gc.test.ts:58 | integration, same file | low |
| 437-440 | Editing a room: name and auto-deletion shown read-only | UNCOVERED | edit-mode e2e covers permissions/initial media/lock/destinations, not the read-only fields | frontend/e2e/room-wizard.test.ts:300 | SPA e2e, room-wizard.test.ts | low (closed in #273) |
| 442-454 | Console rooms list: `room_member` sees member and open rooms and no create button; status filter; scope filters per role | UNCOVERED | console.test.ts covers rows, search, click, delete, bulk delete, pagination only | frontend/e2e/console.test.ts:85 | SPA e2e, console.test.ts | medium (closed in #273) |
| 456-473 | Console room actions: manager vs member action sets; edit disabled during a meeting; access and share disabled for closed rooms and toggle offers reopen | UNCOVERED | no test | none | SPA e2e, console.test.ts | medium (closed in #273) |
| 475-482 | Console room deletion: confirmation, conflict dialog with policies, choose close keeps the room as closed, bulk retry only failed rooms | UNCOVERED | only the notice language (:306) and a malformed-response bulk failure (:400) | frontend/e2e/console.test.ts:400 | SPA e2e, console.test.ts | medium (closed in #273) |
| 484-500 | Console wizard: name-only creation opens the join screen; members that fail to add are warned | PARTIAL | failed creation keeps input and message is unit-tested (room-wizard.component.spec.ts:76,83); creation navigation and member warning are not | frontend/projects/shared-meet-components/src/lib/domains/rooms/pages/room-wizard/room-wizard.component.spec.ts:76 | library unit, same spec | medium (closed in #270) |
| 502-513 | Editing in the wizard: owner opens edit URL during an active meeting redirected to Rooms; non-owner redirected | UNCOVERED | `room-edit-check.guard.ts` has no spec | none | library unit, new case beside the wizard spec or console.test.ts | medium (closed in #270 and #273) |
| 515-529 | Wizard validation: participant limit 31, auto-deletion date under one hour, error text and disabled finish | PARTIAL | duration, auto-start and broadcast covered (wizard-state.service.spec.ts:96,354,389); participant limit range and date bound not | frontend/projects/shared-meet-components/src/lib/domains/rooms/services/wizard-state.service.spec.ts:389 | library unit, same spec | medium (closed in #270) |
| 531-547 | Wizard dependent settings: enabling encryption turns recording and broadcast off and restores them; allowing broadcast turns encryption off | PARTIAL | captions and pairwise exclusion unit-tested (wizard-state.service.spec.ts:197,212); recording/broadcast restore across the on/off cycle not asserted in the UI | frontend/e2e/room-wizard.test.ts:216 | library unit, same spec | low |
| 560-572 | Console room detail: member without `recordingList` sees the no-access message and no Members tab; unreadable room redirects to Rooms | UNCOVERED | `room-access.guard.ts` has no spec; no e2e | none | SPA e2e, console.test.ts | medium (closed in #270 and #273) |

Infra-only: 259 meeting ends on another replica while closing, 286 two replicas delete, 429 two replicas sweep, 588 deletion and meeting end on different replicas.

Counts: rooms: 99 scenarios, PARTIAL 3 (L484, L515, L531), UNCOVERED 11 (L12, L52, L216, L402, L409, L437, L442, L456, L475, L502, L560).

### room-config (33 scenarios, 11 requirements)

| spec line | scenario or rule | status | what is missing | nearest existing test | where the test belongs | value |
|---|---|---|---|---|---|---|
| 112-115 | Recording re-enabled on an encrypted room: `updateRoomConfig {recording.enabled:true}` -> 200 and stays false | UNCOVERED | the schema only knows the request; the service applies `disableFeaturesExcludedByE2EE` to the merged config (room.service.ts:282) with no test of the stored-e2ee case | integration/api/rooms/e2ee-room-config.test.ts:101 (enabling e2ee only) | integration, backend/tests/integration/api/rooms/e2ee-room-config.test.ts | high (spec-listed invariant that integrators hit) (closed in #268) |
| 117-120 | Captions re-enabled on an encrypted room: 200 and stays false | UNCOVERED | same | same | same file | high (closed in #268) |
| 128-133 | Reading the config: API key, logged-in user allowed into the room, 403 for a stranger, 404 unknown room | PARTIAL | `get-room-config.test.ts` has two tests (API-less default and custom config); member-token cases live in room-security.test.ts:578-690, but the response body of the user path is not asserted | integration/api/rooms/get-room-config.test.ts:41 | integration, same file | low |
| 189-200 | Update after the meeting: 200 and the next meeting starts without chat | PARTIAL | 409 during meeting asserted (:230), the post-meeting update and effect on the next meeting are not | integration/api/rooms/update-room-config.test.ts:230 | integration, same file | low |

Counts: room-config: 33 scenarios, PARTIAL 2 (L128, L197), UNCOVERED 2 (L112, L117).

### Totals

| capability | scenarios | PARTIAL | UNCOVERED |
|---|---|---|---|
| authentication | 63 | 3 | 11 (+1 rule L343) |
| permissions | 58 | 12 | 2 |
| room-access | 39 | 2 | 5 |
| room-members | 112 | 9 | 8 |
| users | 63 | 6 | 3 |
| rooms | 99 | 3 | 11 |
| room-config | 33 | 2 | 2 |


## From `gaps-recordings-meetings.md`

Scope: recordings, live-broadcast, webhooks, meetings, live-captions. Read-only audit of the worktree
`.claude/worktrees/no-real-waits`. Only gaps are listed. Columns:
spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value

Test paths are relative to `meet-ce/`. `BE-int` = `backend/tests/integration/api`, `BE-unit` = `backend/tests/unit`,
`E2E` = `frontend/e2e`, `Karma` = `frontend/projects/shared-meet-components/src/lib`.

Heavily covered (nothing worth adding found): all recordings REST contract (start/stop/list/get/media/ZIP/delete/bulk/secrets/GC/auto-start,
BE-int/security/recording-security.test.ts is ~1900 lines), the whole broadcast REST/lifecycle contract (BE-int/meetings/broadcasts.test.ts plus
BE-unit/services/broadcast.service.test.ts and BE-unit/helpers/broadcast.helper.test.ts), webhook delivery/retry/signing/fan-out, the 20-second timers' consumers
(duration limit, reconcile, name reservation), forged server signals (Karma meeting-events.service.spec.ts), captions backend and captions e2e.

### live-captions (spec `openspec/specs/live-captions/spec.md`)

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 134 | Rule "a room member token that names no participant answers 403" for `createAiAssistant` and `cancelAiAssistant` | UNCOVERED | No test sends a room member token without a participant identity; controller returns `errorInsufficientPermissions` (`backend/src/controllers/ai-assistant.controller.ts:18,42`) | `BE-int/security/meeting-security.test.ts:397-456` (401 cases only) | integration, `meeting-security.test.ts` AI Assistant block | medium (closed in #268) |
| 260 | Captions re-enabled on an encrypted room: `updateRoomConfig` sets only `captions.enabled: true` on a room with `e2ee.enabled: true` -> 200 and stays `false` | UNCOVERED | Merge path `room.service.ts:282` runs `disableFeaturesExcludedByE2EE` on stored+sent config; only the "enable e2ee later" direction and schema-level unit are tested | `BE-int/rooms/e2ee-room-config.test.ts:101` and `BE-unit/models/room-request-schemas.test.ts:305` | integration, `e2ee-room-config.test.ts` | medium (closed in #268) |
| 19 | Deployment with captions on: `getCaptionsConfig` answers `enabled: true` | PARTIAL | Only the default (`false`) is asserted; `true` is only exercised indirectly by `ai-assistant.test.ts` through `MEET_ENV.CAPTIONS_ENABLED` | `BE-int/global-config/captions.test.ts:10` | integration, `captions.test.ts` (set `MEET_ENV.CAPTIONS_ENABLED = 'true'`) | low |

Counts: scenarios 40, PARTIAL 1, UNCOVERED 2 (one of them a requirement sentence, not a scenario).

### webhooks (spec `openspec/specs/webhooks/spec.md`)

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 18 | Request with only a room member token (valid, every permission) calls `webhookCreate` -> 401 | UNCOVERED | No test sends a room member token to `/webhooks`; there is no webhook block in the security suites | `BE-int/webhooks/webhook-crud.test.ts:53-68` (no credentials, admin token) | integration, `webhook-crud.test.ts` Authentication block | high (closed in #268) |
| 23 | `room_manager` user calls `webhookList` -> 403 | UNCOVERED | Non-admin user token never tried | same, `webhook-crud.test.ts:62` | integration, `webhook-crud.test.ts` | high (closed in #268) |
| 45 | Rule: blank `roomId` is rejected with 422 on create and update | UNCOVERED | url, empty events, unknown event on create are tested; blank `roomId` is not | `webhook-crud.test.ts:104-120` | integration, `webhook-crud.test.ts` (or unit schema) | low |
| 55 | `webhookUpdate` with `events: ["testEvent"]` -> 422 | PARTIAL | Update 422 only tested with a bad URL | `webhook-crud.test.ts:200` | integration, `webhook-crud.test.ts` | low |
| 68 | Room deleted: scoped webhook stays registered, unchanged, receives no further events | UNCOVERED | No test deletes the room of a scoped webhook and re-reads the webhook | `BE-int/webhooks/webhook-fanout.test.ts:153` (room scope only) | integration, `webhook-crud.test.ts` (createRoom, webhook `roomId`, deleteRoom, `webhookGet`) | medium (closed in #268) |
| 115 | Delete a webhook: a matching event afterwards is not delivered | PARTIAL | Only 404 on `webhookGet` after delete; no event sent afterwards | `webhook-crud.test.ts:209` | integration, `webhook-fanout.test.ts` | low |
| 128, 133 | Registry change on replica A applies to the next event sent by replica B (register, pause) | UNCOVERED | Nothing simulates a second replica for the registry; dispatcher reads the registry per event but no test pins it (register/pause between two events on the same dispatcher instance would prove it) | `BE-unit/services/webhook-dispatcher.service.test.ts:202` (fixed registry) | unit, `webhook-dispatcher.service.test.ts` | low |
| 141 | `webhookTest` on a paused webhook still delivers one `testEvent` | PARTIAL | Reachable-endpoint test uses an enabled webhook | `webhook-crud.test.ts:225` | integration, `webhook-crud.test.ts` | low |
| 212, 217 | Retry policy as shipped: 5 retries, first wait 0.3 s, doubling, 6 attempts then drop | PARTIAL | Tests override `WEBHOOK_RETRY_ATTEMPTS` / `WEBHOOK_RETRY_INITIAL_DELAY`; nothing asserts the shipped defaults or the doubling beyond 2 waits | `webhook-dispatcher.service.test.ts:247,261` | unit, `webhook-dispatcher.service.test.ts` (assert `INTERNAL_CONFIG` defaults) | medium (closed in #268) |
| 222 | Receiver answers after the 5 s timeout -> server retries and receiver gets same body/signature again | PARTIAL | Timeout is tested with 0 retries (abandon only); retry-after-timeout not asserted | `webhook-dispatcher.service.test.ts:273` | unit, same file | low |
| 199 | API key regenerated: next delivery signed with the new key, not the old | UNCOVERED | Dispatcher test uses one fixed key; no test changes the key between two events | `webhook-dispatcher.service.test.ts:202` | unit, same file | medium (closed in #268) |
| 243 | Slow receiver (5 s) does not delay `participantRoleUpdate` | UNCOVERED | No test makes a receiver slow while a REST action that emits a webhook runs | `BE-int/webhooks/webhook.test.ts:368` | integration, `webhook.test.ts` | medium (closed in #268) |
| 251 | Earlier delivery retried: `recordingUpdated` may arrive before the retried `recordingStarted`, with later `creationDate` ordering | UNCOVERED | Ordering independence never asserted | `webhook.test.ts:492` | integration, `webhook-fanout.test.ts` | low |
| 277 | Webhook filtered to any subset of the fourteen event types is accepted | PARTIAL | Only two event names used; nothing compares the enum with the validation schema | `webhook-crud.test.ts:86` | unit, `BE-unit/models` webhook schema test (or `webhook-crud.test.ts`) | low |
| 322 | Malformed initial webhook URL logs a warning naming the URL | PARTIAL | Only "nothing registered, start does not fail" is asserted | `BE-unit/services/webhook-registry.service.test.ts:204` | unit, same file | low |
| 328 | Two replicas start together with `MEET_INITIAL_WEBHOOK_URL`: exactly one webhook registered | UNCOVERED | Only sequential double init is tested | `webhook-registry.service.test.ts:184`, `BE-int/webhooks/webhook-config-migration.test.ts:404` | unit, `webhook-registry.service.test.ts` (two concurrent `initializeDefaultWebhook`) | medium (closed in #268) |
| 354 | Console list: mixed webhooks rows, "all events"/"all rooms", count 1 of 2 | UNCOVERED | No console webhook list test of any kind (only `webhook.service.spec.ts` for the HTTP client) | `E2E/console.test.ts` (no webhook test) | e2e, `console.test.ts` (Embedded page) | medium (closed in #273) |
| 363 | Editor: narrowed filter with no events keeps Save disabled | UNCOVERED | `webhook-editor-dialog` has no spec | none | Karma, new spec only if the dialog has none today; else `console.test.ts` | medium (closed in #273) |
| 367 | Editor: server refuses (limit 10) keeps dialog open with typed values and the limit message | UNCOVERED | same | none | e2e `console.test.ts` | medium (closed in #273) |
| 375 | Pause from the list sends `enabled: false` with URL, filter and room scope unchanged | UNCOVERED | same | none | e2e `console.test.ts` | medium (closed in #273) |
| 379 | Test fails: notice shows the failure and the server reason | UNCOVERED | same | none | e2e `console.test.ts` | low (closed in #273) |
| 387 | No API key: warning shown and add action disabled | UNCOVERED | same | none | e2e `console.test.ts` | medium (closed in #273) |

Counts: scenarios 59, PARTIAL 8 (55, 115, 141, 212/217 counted once as 212 and once as 217, 222, 277, 322 = 9 scenario lines, 8 rows), UNCOVERED 15 scenarios
(18, 23, 68, 128, 133, 199, 243, 251, 328, 354, 363, 367, 375, 379, 387) plus one rule sentence (blank `roomId`).

### meetings (spec `openspec/specs/meetings/spec.md`)

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 55 | A meeting nobody connects to ends after 20 s: `meetingEnded` sent, room back to `open` | UNCOVERED | No test of the empty-meeting timeout; `.env.test` sets `MEETING_DEPARTURE_TIMEOUT=1s` and nothing reads the 20 s defaults (`internal-config.ts:80-81`, `room.service.ts:240-241`) | `BE-unit/services/livekit-webhook.service.test.ts:333` (end handling only) | unit, `BE-unit/services/room.service.test.ts` (createLivekitRoom gets `emptyTimeout`/`departureTimeout` 20) plus one integration with a shortened `MEETING_EMPTY_TIMEOUT` in `BE-int/rooms/active-status-rooms-gc.test.ts` | medium |
| 64, 69 | Last participant leaves: meeting ends after the window; rejoining inside it enters the same meeting without a second `meetingStarted` | UNCOVERED | No test leaves, waits less than the window, rejoins, and asserts one `meetingStarted` / same `sid` | `BE-int/webhooks/webhook.test.ts:299` | integration, `webhook.test.ts` (use `MEETING_DEPARTURE_TIMEOUT` as configured in `.env.test`) | medium |
| 75 | Room config update inside the window -> 409 | UNCOVERED | The 409 is tested only with `markRoomAsActiveMeeting`, never in the post-leave window | `BE-int/rooms/update-room-config.test.ts:230` | integration, `update-room-config.test.ts` | low |
| 25 | Later participants join the running meeting, no new meeting starts | PARTIAL | `meetingStarted` exactly-once only asserted per start, not across a second join | `E2E/meeting-start.test.ts:28` | integration, `webhook.test.ts:274` (join twice, count `meetingStarted`) | low |
| 83 | `meetingEnd`: every participant disconnected with reason `meeting_ended` and recordings stopped | PARTIAL | `end-meeting.test.ts` checks the LiveKit room removal only; `participantLeft.leaveReason` `meeting_ended` of a REST end is not asserted (helper mapping is unit-tested) | `BE-int/meetings/end-meeting.test.ts:29` | integration, `end-meeting.test.ts` or `webhook.test.ts:230` | medium (closed in #268) |
| 94 | `meetingEnd` for a room that does not exist (API key / authorized caller) -> 404 | UNCOVERED | Only "another room's token on a missing room" -> 403 | `end-meeting.test.ts:61` | integration, `end-meeting.test.ts` | low |
| 122 | Embedded `meetingEnd()` without `meetingEnd` permission is rejected and the meeting keeps running | UNCOVERED | No permission-gate test for `meetingEnd`/`endMeeting` command (broadcast, mute, promote have one) | `Karma/domains/embedded/services/embedded-command.service.spec.ts:301-376`; `webcomponent/tests/e2e/commands.test.ts:271` | Karma, `embedded-command.service.spec.ts` | medium |
| 301 | Same member in a second tab: first tab leaves with `duplicate_identity` | UNCOVERED | Only the reason mapping (`BE-unit/helpers/participant.helper.test.ts`) and name logic (`participant-name.service.test.ts:244`) are tested; no end-to-end duplicate join | `BE-int/meetings/participant-name.service.test.ts:244` | e2e, `E2E/participants.test.ts` or webcomponent `events.test.ts` LEFT block | medium |
| 388 | Lost connection (browser crash) -> `participantLeft` `network_disconnect` | PARTIAL | Reason mapping unit-tested; no integration/e2e drops a connection | `BE-unit/helpers/participant.helper.test.ts` | integration, `webhook.test.ts:299` (abruptly drop the fake participant) | low |
| 384, 130, 169 | Duration limit end: each `participantLeft` has `meeting_ended`, and `meetingEnded` carries `max_duration_reached` | PARTIAL | Unit-tested in dispatcher/livekit-webhook; the GC integration test checks only that the LiveKit room is gone | `BE-int/rooms/meeting-duration-limit-gc.test.ts:124` | integration, same file (add a webhook receiver) | low |
| 293 | Anonymous participant gets a new identity on every join (`ana-` prefix, differs) | PARTIAL | Prefix asserted at `waiting-participants.test.ts:145`; the "differs after rejoin" half is not | `BE-int/room-members/generate-room-member-token.test.ts:762-797` | integration, `generate-room-member-token.test.ts` | low |

Counts: scenarios 75, PARTIAL 5 (25, 83, 388, 384, 293), UNCOVERED 5 scenarios (55, 64/69 counted as 2, 75, 94, 122, 301 -> 7 scenario lines; 6 rows).
Normalised: PARTIAL 5, UNCOVERED 7 (55, 64, 69, 75, 94, 122, 301).
Replica scenarios (two replicas) all have a simulation or a unit equivalent; none counted as gaps.

### live-broadcast (spec `openspec/specs/live-broadcast/spec.md`)

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 82 | Meeting started webhook: the room payload (and `meetingEnded`) never carries a stream key | UNCOVERED | Webhook tests use a room without destinations (`config` equals `defaultRoomConfig`); redaction of the room's destinations in these payloads is asserted nowhere. Broadcast webhooks themselves are checked (webcomponent `events.test.ts:752`) | `BE-int/webhooks/webhook.test.ts:172-200` | integration, `webhook.test.ts` (room with a broadcast destination, assert URL ends `/********`) | high (closed in #268) |
| 324 | Reading broadcasts with a token holding `meetingJoin` alone (no `meetingRead`) | UNCOVERED | Only a speaker token (holds `meetingRead`) is used for list | `BE-int/security/meeting-security.test.ts:193` | integration, `meeting-security.test.ts` Broadcast block | medium (closed in #268) |
| 625 | `broadcastGet`/`broadcastStop` of a broadcast with a token of another room -> 403 before any lookup | UNCOVERED | Other-room token is tested for start and for bulk stop only | `BE-int/meetings/broadcasts.test.ts:590`; `meeting-security.test.ts:202` | integration, `broadcasts.test.ts` | medium (closed in #268) |
| 508 | Nobody publishes: going live disabled, activity asks to share audio or video; same for More options (547) | UNCOVERED | No UI test of the disabled state or its message | `E2E/broadcasts.test.ts:128` | e2e, `broadcasts.test.ts` (or Karma `broadcast-activity.component.spec.ts`) | medium (closed in #270) |
| 533 | Retry a failed destination while another stays live; all failed shows failure with retry and dismiss | UNCOVERED | State service covers failure bookkeeping; no UI test clicks retry or dismiss | `Karma/.../broadcast-state.service.spec.ts:84-154`; `E2E/broadcasts.test.ts:95` (editor Retry only) | Karma, `broadcast-activity.component.spec.ts` | medium (closed in #270) |
| 525 | Participant with `broadcastControl` but not `broadcastEdit` is offered no add-destination option | UNCOVERED | Not asserted in UI | `E2E/broadcasts.test.ts:140` (no controls at all) | Karma, `broadcast-activity.component.spec.ts` | medium (closed in #270) |
| 432 | Embedded `broadcastStart({ destinations })` without `broadcastEdit`: nothing starts, console logs the refusal | UNCOVERED | Command gate tests cover `broadcastControl` only; REST refusal is tested server-side | `Karma/domains/embedded/services/embedded-command.service.spec.ts:567-583`; `webcomponent/tests/e2e/commands.test.ts:971` | Karma, `embedded-command.service.spec.ts` | medium (closed in #270) |
| 426 | Embedded `broadcastStart({ destinationIds })` is shown as connecting in an open activity | UNCOVERED | No test | `webcomponent/tests/e2e/commands.test.ts:945` | e2e, webcomponent `commands.test.ts` (or Karma activity spec) | low |
| 490 | Clicking the `LIVE` mark opens the Live broadcast activity | UNCOVERED | Mark rendering is tested, its click is not | `Karma/.../status-rail.component.spec.ts:138` | Karma, `status-rail.component.spec.ts` | low |
| 555 | Live broadcast disabled in the room: More options has no live broadcast item | UNCOVERED | Not asserted in toolbar or room-features e2e | `E2E/toolbar.test.ts` | e2e, `toolbar.test.ts` | low |
| 472, 477 | Joining a live meeting shows `LIVE` with time on air and the "meeting is live" notice; last destination stopped shows the ended notice to every participant | PARTIAL | The speaker test checks the badge only; notices are checked for the participant who started/stopped | `E2E/broadcasts.test.ts:57,140` | e2e, `broadcasts.test.ts` | low |
| 550 | Toolbar go live reaches both destinations and opens the activities panel | PARTIAL | Test has one destination and does not assert the panel | `E2E/broadcasts.test.ts:128` | e2e, `broadcasts.test.ts` | low |

Counts: scenarios 107, PARTIAL 3 (472/477 counted as 2: 472, 477, plus 550 -> 3), UNCOVERED 9 scenarios (82, 324, 625, 508, 533, 525, 432, 426, 490, 555 -> 10).
Normalised: PARTIAL 3 (472, 477, 550), UNCOVERED 10 (82, 324, 625, 508, 533, 525, 432, 426, 490, 555).

### recordings (spec `openspec/specs/recordings/spec.md`)

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 669 | Auto-start room: starting disabled with an explanation that the room records on its own | UNCOVERED | No UI test of the disabled start control in an auto-start room (server 403 is tested) | `E2E/recordings.test.ts:53`; `BE-int/recordings/start-recording.test.ts:795` | e2e, `recordings.test.ts` | medium |
| 679 | Failed recording: activities panel shows the failure and offers retry | UNCOVERED | `FAILED` is only awaited as an error in a helper; no panel test | `E2E/helpers/recordings.helper.ts:99-113` | e2e, `recordings.test.ts` (or Karma activity spec) | medium |
| 770 | Anonymous sharing disabled: share dialog offers only "OpenVidu Meet users" | UNCOVERED | No share-dialog test with `access.anonymous.recording.enabled: false` (`recording-share-dialog` has no spec) | `E2E/recordings.test.ts:173,201` | e2e, `recordings.test.ts` | medium |
| 782, 786, 791 | Console Recordings page: admin sees all with download/delete; member without delete has no delete; member without play has play/share disabled with tooltip naming `recordingPlay` | UNCOVERED | Console test only checks the page renders; the permission matrix is tested for room list and individual view (`permissions.test.ts:386-436`), not for the console page | `E2E/console.test.ts:226-232`; `E2E/permissions.test.ts:386-436` | e2e, `console.test.ts` | medium (closed in #273) |
| 802 | Console recording detail of a recording the user may not read returns to the Recordings page | UNCOVERED | No console detail test (`recording-detail` has no spec) | `E2E/console.test.ts` | e2e, `console.test.ts` | medium (closed in #273) |
| 892 | Concurrent ZIPs do not block other downloads or each other | UNCOVERED | Unit tests prove one file open at a time and abort cleanup; no test runs two ZIPs plus a media download concurrently | `BE-unit/services/recording.service.test.ts:866-960` | integration, `BE-int/recordings/download-recordings.test.ts` | low |
| 887 | ZIP of 100 recordings holds at most one recording open | PARTIAL | Unit uses a few recordings; the 100-id integration case is only the 101-id 422 | `recording.service.test.ts:866`; `download-recordings.test.ts:162` | integration, `download-recordings.test.ts` | low |
| 690 | Participant joining a recorded meeting sees REC mark with elapsed time and the recording notice | PARTIAL | Notice logic is unit-tested and the embedded event for a late joiner is e2e-tested; no SPA e2e shows the REC mark of a joiner | `Karma/.../recording-notice.service.spec.ts:78-96`; `webcomponent/tests/e2e/events.test.ts:375` | e2e, `recordings.test.ts` | low |
| 69 | Per-recording override leaves the room's `recording.layout` unchanged | PARTIAL | Response of the override is asserted; the room is not re-read | `BE-int/recordings/start-recording.test.ts:639` | integration, same file | low |

Counts: scenarios 138, PARTIAL 3 (887, 690, 69), UNCOVERED 8 (669, 679, 770, 782, 786, 791, 802, 892).

### Totals

| capability | scenarios counted | PARTIAL | UNCOVERED |
| --- | --- | --- | --- |
| live-captions | 40 | 1 | 2 (1 scenario + 1 rule sentence) |
| webhooks | 59 | 8 | 15 (+1 rule sentence) |
| meetings | 75 | 5 | 7 |
| live-broadcast | 107 | 3 | 10 |
| recordings | 138 | 3 | 8 |

(The counts in the per-capability paragraphs above that were corrected inline are superseded by this table.)

### Possible product bugs (spec and code disagree)

None confirmed. One behaviour to confirm: `backend/src/controllers/ai-assistant.controller.ts:18,42` answers a participant-less room member token with `errorInsufficientPermissions` (403), which is what the spec at line 134 requires; no test pins it.


## From `gaps-meeting-ui.md`

Checkout: `.claude/worktrees/no-real-waits`. Path aliases: `FE` = `meet-ce/frontend`, `LIB` = `meet-ce/frontend/projects/shared-meet-components/src/lib`, `BE` = `meet-ce/backend/tests`. Spec lines are lines of `openspec/specs/<capability>/spec.md`. Only gaps are listed; COVERED scenarios are omitted. Verdicts come from reading the candidate tests (titles, steps, helpers) plus a second grep on component/service names; a few PARTIAL rows say "to verify" where only titles/helper names were read.

Columns: spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test (file:line) | cheapest level and existing file | value

### meeting-join

| spec line | scenario or rule | verdict | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 87 | Reload after entering (`secret` and `e2ee-key` removed from the address bar; reload re-enters with same access) | UNCOVERED | No test asserts the address bar loses `secret`/`e2ee-key` after entering, nor that a reload shows the join screen of the same room with the same access (grep of `toHaveURL`/`page.url()` finds nothing for it). | `LIB/domains/meeting/services/meeting-entry.service.spec.ts:131` (restores secret/key from storage only) | e2e: `FE/e2e/access.test.ts` (`Join screen access` block, L500) | high (closed in #270) |
| 521 | Leave redirect, non-web destination (`javascript:` scheme) | UNCOVERED | Only a relative URL is refused; `javascript:`/`data:` is never passed to `NavigationService`, so the `^https?://` guard (navigation.service.ts:37) has no assertion. Security-relevant. | `LIB/shared/services/navigation.service.spec.ts:175` (relative path refused) | unit: `LIB/shared/services/navigation.service.spec.ts` | high (closed in #270) |
| 361 | Host removes the element: no `meetingLeft` | UNCOVERED | No test removes the element/iframe of a joined participant and asserts the host gets no `meetingLeft` (only the waiting case, `commands.test.ts:1169`, and the `<html>`/style tests that call `element.remove()` assert other things). | `FE/webcomponent/tests/e2e/commands.test.ts:1169` | e2e: `FE/webcomponent/tests/e2e/events.test.ts` (LEFT Event block, L140) | high (closed in #270) |
| 321 | Fields not carried over (`participant-external-id` of an earlier entry) | UNCOVERED | No test enters twice with the same element and asserts the second participant has no `externalId`/`metadata`. | `FE/webcomponent/tests/e2e/identified-guest-state.test.ts:28` (name only) | e2e: `FE/webcomponent/tests/e2e/events.test.ts` (PARTICIPANT_JOINED, L477) | medium |
| 206 | Double press on the device-setup join button | UNCOVERED | No test presses join twice quickly and asserts one join, one name, one identity (no double-click/dblclick found). | `FE/e2e/meeting-start.test.ts:28` (single press) | e2e: `FE/e2e/meeting-start.test.ts` | medium |
| 437, 442, 447 | End screen text per reason (removed by moderator, duration limit, joined from another tab) | UNCOVERED | Tests only wait for `.disconnected-container` (`FE/e2e/helpers/meeting-navigation.helper.ts:181`); no title/message is asserted for any reason. There is no spec of `end-meeting.component`. | `FE/e2e/participants.test.ts:352` (kicked, container only) | e2e: `FE/e2e/participants.test.ts` (kick tests L333/L360) for the kicked text; second tab in the same file L445 for "other tab" | medium |
| 401, 406 | Reasons `meeting_ended_by_duration_limit` and `duplicate_identity` reach the host / UI | PARTIAL | Mapping is unit-tested (`meeting-event-handler.service.spec.ts:1700`, backend `participant.helper.test.ts:241`), but no e2e lets a real meeting reach its duration limit or joins the same identity twice and checks `meetingLeft.reason`. | `LIB/domains/meeting/services/meeting-event-handler.service.spec.ts:1700` | e2e: `FE/webcomponent/tests/e2e/events.test.ts` (LEFT Event, L140; second tab as in `FE/e2e/participants.test.ts:445`) | medium |
| 45, 50, 55, 60, 65 | Access error screens: "Invalid link", "Anonymous access disabled", "Invalid member", "Invalid room", "Forbidden room access" | PARTIAL | HTTP failure to reason mapping is unit-tested (`room-member-token-failure.utils.spec.ts:7-27`); e2e `access.test.ts` only calls the generic `expectRoomAccessDenied`, and no scenario covers unknown secret, anonymous-disabled, removed guest or deleted room through the real UI. The screen titles are never asserted. | `FE/e2e/access.test.ts:249` (non-member denied) | e2e: `FE/e2e/access.test.ts` (add scenarios to `accessScenarios`) | medium |
| 460 | Signed-in user: leave then `Back to Rooms` shows the console rooms page | UNCOVERED | Only the negative (`not.toContainText('Back to Rooms')`, events.test.ts:234) and the unit label (`meeting-join.service.spec.ts:253`); the navigation to the console is never exercised. | `LIB/shared/components/error/error.component.spec.ts:45` (error screen only) | e2e: `FE/e2e/access.test.ts` or `FE/e2e/console.test.ts` | low |
| 455 | End screen of an anonymous participant in the standalone app shows no dismiss button | PARTIAL | Tested for the error component (`error.component.spec.ts:51`), not for the end screen (`end-meeting.component`). | `LIB/shared/components/error/error.component.spec.ts:51` | e2e: `FE/e2e/participants.test.ts` (kick, L352 where the disconnected page is already open) | low |
| 129 | Closed room join screen: notice, no name field or join button | PARTIAL | Logic tested (`meeting-join.service.spec.ts:130`, `meeting-entry-flow.utils.spec.ts:31`); no test renders the join screen of a closed room and asserts the notice and the absence of the form. | `LIB/domains/meeting/services/meeting-join.service.spec.ts:130` | e2e: `FE/e2e/permissions.test.ts` (`Join screen` block, L161, next to the `canJoinMeeting` card) | medium |
| 139 | Anonymous recording link on the join screen shows the access-restricted notice and offers the recordings | PARTIAL | `expectJoinScreenAccessRestricted` is used only for `canJoinMeeting` false (`permissions.test.ts:162`); the recording-secret join screen and its "browse recordings" offer are not asserted (to verify against `access.test.ts` recordings views, which open the list directly). | `FE/e2e/permissions.test.ts:162` | e2e: `FE/e2e/access.test.ts` (`Room recordings list access`, L516) | low |
| 147 | Preparation failure after 12 seconds | PARTIAL | `meeting-entry-flow.service.spec.ts:96` asserts the error step and dialog on failure; the 12 s bound (`meeting-join.service.ts:156`) is never exercised. | `LIB/domains/meeting/services/meeting-entry-flow.service.spec.ts:96` | unit: `LIB/domains/meeting/services/meeting-join.service.spec.ts` (fake clock) | low |
| 542 | "Room access revoked" screen after demotion | PARTIAL | `permissions.test.ts:649` asserts a redirect to an error page; the title "Room access revoked" is not checked. | `FE/e2e/permissions.test.ts:649` | e2e: same file, add the title assertion | low |
| 37 | Embedded element without a usable `room-url`: "Unable to load OpenVidu Meet" screen and console log | PARTIAL | Route resolution to `invalid` is unit-tested (`wc-route.utils.spec.ts:129,133`); the rendered error screen and the console cause are never asserted. | `LIB/domains/embedded/utils/wc-route.utils.spec.ts:129` | e2e: `FE/webcomponent/tests/e2e/events.test.ts` (error-screen block near L241, which already opens an error screen) | low |
| 509 (rule) | Leave redirect inside an iframe whose sandbox forbids navigating the host navigates the iframe itself | UNCOVERED | No test sets a sandboxed iframe; only host navigation is asserted (`navigation.service.spec.ts:101`). | `LIB/shared/services/navigation.service.spec.ts:101` | unit: `LIB/shared/services/navigation.service.spec.ts` | low |

Counts: scenarios 90, PARTIAL 14, UNCOVERED 8 (plus 1 rule gap: iframe sandbox).

### meeting-media

| spec line | scenario or rule | verdict | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 476 | Full reconnect: blocking "connection lost, reconnecting" dialog, media and panel buttons disabled, open panel closed, media resumed | UNCOVERED | Nothing renders or asserts the dialog, the disabled buttons, the closed panel or the resumed media state; existing tests cover only the roster/layout across a reconnect and the waiting screen's "Reconnecting" subtitle. | `LIB/domains/meeting/openvidu-components/services/meeting-livekit/meeting-livekit.service.spec.ts:183` (reports full reconnect) | Karma: `LIB/domains/meeting/openvidu-components/components/toolbar/toolbar.component.spec.ts` (the `isConnectionLost` signal) and `meeting-view.component.spec.ts` for the dialog | high (partly closed in #270 (the open panel closes; the dialog and the disabled buttons stay open)) |
| 482 | Signalling resume is transparent (no dialog, no interruption) | UNCOVERED | Same dialog code, no negative test. | `meeting-livekit.service.spec.ts:183` ("but not a signal-only one") | Karma: `meeting-view.component.spec.ts` | medium |
| 231 | Screen share stopped from the browser's own control stops it in the meeting | UNCOVERED | `screensharing.test.ts` only uses the toolbar button (`stopScreensharing`); no test ends the capture track and checks tile, state and event. | `FE/e2e/screensharing.test.ts:39` | e2e: `FE/e2e/screensharing.test.ts` (end the track in the page) or Karma `local-media.service.spec.ts` | medium |
| 467 | Encrypted meeting: webhook and REST hold only the encrypted name; `participant-external-id`/`metadata` stay clear | UNCOVERED | No test of a webhook/REST response from a real E2EE meeting. Backend webhook suites never use an encrypted room. | `FE/e2e/e2ee.test.ts:124` (UI decrypts names) | e2e: `FE/webcomponent/tests/e2e/events.test.ts` (webhook markers) or `FE/e2e/e2ee.test.ts` with `webhooks` helper | medium |
| 409 | Remembered background effect applied on the device-setup screen and when joining | UNCOVERED | Only the negative (saved effect not applied when the feature is off, `room-features.test.ts:~97`); positive path never asserted. | `FE/e2e/room-features.test.ts:84` | e2e: `FE/e2e/virtual-backgrounds.test.ts` | medium |
| 371 | Background effect removed and panel closed when `mediaChangeVirtualBackground` or `mediaPublishVideo` is lost mid-meeting | PARTIAL | `permissions.test.ts:229,234` cover "not offered" states from the start; the live revocation with an applied effect is not (live-update test `permissions.test.ts:514` does not include backgrounds, to verify). | `FE/e2e/permissions.test.ts:234` | e2e: `FE/e2e/permissions.test.ts` (`Live permission and role updates`, L508) | medium |
| 110 | Microphone redundant audio (RED) outside E2EE rooms, none inside | UNCOVERED | Only the 24 kbps cap is asserted (`media-devices.test.ts:474`). Code sets only `audioPreset` (`local-media.service.ts:33`) and relies on SDK defaults, so a SDK bump could drop `red`/`dtx` silently. | `FE/e2e/media-devices.test.ts:474` | e2e: `FE/e2e/media-devices.test.ts` (read sender codecs/`dtx` as `getPublishedAudioBitrateCaps` does), plus one in `e2ee.test.ts` | medium |
| 104 | Speaking: silence suppression (DTX) kept | PARTIAL | Bitrate cap asserted, DTX not. | `FE/e2e/media-devices.test.ts:474` | e2e: same test as above | low |
| 262 | Sharing the entire screen with system audio excludes the meeting's own playback | UNCOVERED | `suppressLocalAudioPlayback`, `systemAudio`, `selfBrowserSurface` (`screen-share.service.ts:90-94`) are never asserted. | `FE/e2e/screensharing.test.ts:105` (echoCancellation etc. only) | Karma: add a `screen-share.service.spec.ts` case next to existing service specs (no spec found for the service; nearest existing file `local-media.service.spec.ts`) | low |
| 236 | Screen sharing not offered on the device-setup screen nor on Android/iOS | UNCOVERED | Only the embedded command refusal on prejoin (`embedded-command.service.spec.ts:292`); no test that the button is absent. | `LIB/domains/embedded/services/embedded-command.service.spec.ts:292` | e2e: `FE/e2e/media-devices.test.ts` Android case at L179 | low |
| 123, 130 | Camera off stops capture (light off), microphone keeps capturing while muted | PARTIAL | `local-media.service.spec.ts:440,450` assert mute/unmute of the track, not that the camera capture stops or that the mic stays captured. | `LIB/.../local-media/local-media.service.spec.ts:440` | Karma: same file | low |
| 66 | Turning the camera on fails in the meeting: notice for 10 seconds | PARTIAL | "says so" asserted (`local-media.service.spec.ts:473`), the 10 s duration is not. | `local-media.service.spec.ts:473` | Karma: same file | low |
| 496 | Camera button disabled while its change is in progress | UNCOVERED | `toolbar.component.spec.ts:24,35` cover only the microphone. | `LIB/.../toolbar/toolbar.component.spec.ts:24` | Karma: same file | low |
| 562 | Apply disabled while the switch is in progress | PARTIAL | Service reports "applying" (`device-trial.service.spec.ts:372`); the disabled button in `audio-video-settings` is not asserted. | `device-trial.service.spec.ts:372` | Karma: `audio-video-settings.component.spec.ts` | low |
| 518 | Trying a camera with a background effect: preview without effect and a hint | UNCOVERED | Not found in any test. | `FE/e2e/media-devices.test.ts:125` | e2e: same file | low |
| 577 | Changing tab discards an unapplied pick | UNCOVERED | Close panel (`media-devices.test.ts:144`) and unplug are covered, tab change is not. | `FE/e2e/media-devices.test.ts:144` | Karma: `audio-video-settings.component.spec.ts` | low |
| 396 | Browser without background-effect support | PARTIAL | `isBackgroundProcessorSupported` is stubbed in `meeting-media-setup.component.spec.ts:129`, no assertion on the unsupported behavior found. | `meeting-media-setup.component.spec.ts:129` | Karma: same file | low |
| 401 | Sender's window minimised keeps background effect/video flowing | UNCOVERED | No test. | n/a | skip or e2e `virtual-backgrounds.test.ts` | low |
| 440 | `e2ee-key` ignored for a room with E2EE off | PARTIAL | Join-screen hiding is tested (`e2ee.test.ts:66`); no test enters an unencrypted room with a key and checks nothing is encrypted. | `FE/e2e/e2ee.test.ts:66` | e2e: `FE/webcomponent/tests/e2e/attributes.test.ts` (E2EE block, L97) | low |
| 655 | Setup-screen mic toggle shows the live level (not for off/system-muted) | UNCOVERED | Level fill tested only in settings (`audio-devices.component.spec.ts:117`); the setup toggle fill is not. | `audio-devices.component.spec.ts:117` | Karma: `meeting-media-setup.component.spec.ts` | low |
| 241 (rule) | Firefox: the screen share button stops the share directly | UNCOVERED | Platform spec has no Firefox share-button case. | `platform.service.spec.ts:33` | Karma: `platform.service.spec.ts` / toolbar spec | low |

Counts: scenarios 100, PARTIAL 8, UNCOVERED 13 (plus 1 rule gap: Firefox button).

### meeting-layout

| spec line | scenario or rule | verdict | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 14 | Pinning is the viewer's own: A pins B, B and C unchanged | PARTIAL | Pin layout asserted for the pinner only (`layout.test.ts:151`); nobody checks the other viewers' layouts. | `FE/e2e/layout.test.ts:151` | e2e: `FE/e2e/layout.test.ts` | medium |
| 169 | Pin and unpin a camera: enlarged, strip at most 220 px, grid returns to equal tiles | PARTIAL | `stream.test.ts:974-1000` only checks the pin button is visible; the unpin-restores-grid and the 220 px strip cap are not asserted (cap is partly in `layout.service.spec.ts:330`). | `FE/e2e/layout.test.ts:151` | e2e: `FE/e2e/layout.test.ts` | medium |
| 214 | Docked choice remembered across meetings | UNCOVERED | Only layout mode memory is tested (`layout.test.ts:112,127`); the docked own video persisting in a later meeting is not. | `FE/e2e/layout.test.ts:112` | e2e: `FE/e2e/layout.test.ts` | medium |
| 227 | Pinned own video: Your video choice disabled with a note; pinning a floating own video docks it first | UNCOVERED | No test pins the own tile or opens the Layout tab in that state. | `FE/e2e/layout.test.ts:86` | e2e: `FE/e2e/layout.test.ts` | medium |
| 335 (+ rule) | Side panels: beside the grid and grid shrinks over 790 px; over the meeting at full width otherwise; embedded always beside | PARTIAL | Mode switch tested in `sidenav-layout.directive.spec.ts:139`; no e2e of the grid shrinking or of the 790 px threshold or the embedded override. | `LIB/.../layout/sidenav-layout.directive.spec.ts:139` | e2e: `FE/e2e/panels.test.ts` (viewport widths) and `FE/webcomponent/tests/e2e/room.test.ts` | medium |
| 356 | Notifications placement with a panel open (stacks, uncovered header) | UNCOVERED | No test places a notice next to an open panel. | n/a | e2e: `FE/e2e/panels.test.ts` | low |
| 369 | F11 on the host page not handled by the embedded meeting | PARTIAL | Shortcut keys are covered (`room.test.ts:299`), F11 specifically is not (`toolbar.component.ts:399-404`). | `FE/webcomponent/tests/e2e/room.test.ts:299` | Karma: `LIB/domains/meeting/utils/keyboard-shortcut.utils.spec.ts` or `toolbar.component.spec.ts` | low |
| 377 | Phone rotated to landscape shows the rotate message (also over the setup screen) | PARTIAL | `viewport.service.spec.ts:124` covers the decision only; the message is never rendered/asserted. | `LIB/.../viewport/viewport.service.spec.ts:124` | Karma: `meeting-view.component.spec.ts` | low |
| 266 | Embedded alone: waiting message, no access link | PARTIAL | `room.test.ts:391` asserts the link is absent; the waiting message is not asserted. | `FE/webcomponent/tests/e2e/room.test.ts:391` | e2e: same test | low |

Counts: scenarios 56, PARTIAL 6, UNCOVERED 3 (the panel width rule is folded into the row at 335).

### meeting-moderation

| spec line | scenario or rule | verdict | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 357 | Next meeting with the old token (kicked, meeting ended since) | UNCOVERED | Only the same-meeting reconnect is tested. | `BE/integration/api/meetings/kick-participant.test.ts:98` | integration: same file | medium (closed in #268) |
| 346 | Reconnecting with the old token: removed at once, no `participantJoined`/`participantLeft` webhook | PARTIAL | Removal is asserted; the absence of webhooks is not. | `kick-participant.test.ts:98` | integration: same file (or `BE/integration/webhooks/webhook.test.ts`) | medium |
| 338 | Kicked participant in a locked room waits in the line | UNCOVERED | No test kicks an admitted speaker of a locked room and re-requests a join. | `BE/integration/api/meetings/waiting-participants.test.ts:316` (kick helper in another context) | integration: `BE/integration/api/meetings/waiting-participants.test.ts` | medium (closed in #268) |
| 333 | Kicked anonymous speaker: disabling the anonymous link during the active meeting answers 409 and the link still lets them join | PARTIAL | Generic 409 for config changes during a meeting (`update-room-config.test.ts:230`); the link-disable path and the re-join after it are not. | `BE/integration/api/rooms/update-room-config.test.ts:230` | integration: `BE/integration/api/meetings/kick-participant.test.ts` | low |
| 328 | Kicked identified guest whose member record is deleted cannot join | PARTIAL | Removed guest refused (`generate-room-member-token.test.ts:484`) but not after a kick. | `BE/integration/api/room-members/generate-room-member-token.test.ts:484` | integration: same kick file | low |
| 265 | Member edit is not a role change (no `participantRoleChanged` webhook) | UNCOVERED | Webhook test covers promote/demote only (`webhook.test.ts:368`). | `BE/integration/webhooks/webhook.test.ts:368` | integration: same file | low |
| 52 | Kick of the live captions assistant answers 404, captions keep arriving | PARTIAL | Recorder kick covered at integration (`kick-participant.test.ts:141`); the assistant only at unit level (`meeting-mute.test.ts:180`, "recorder or an agent"). | `BE/integration/api/meetings/kick-participant.test.ts:141` | integration: `BE/integration/api/meetings/ai-assistant.test.ts` | low |

Counts: scenarios 58, PARTIAL 4, UNCOVERED 3.

### meeting-chat

| spec line | scenario or rule | verdict | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 106, 111, 116 (+ rule at 103) | Enter sends and clears the input; blank message not sent; 500-char input limit; consecutive spaces collapse | UNCOVERED | `sendChatMessage` always clicks `#send-btn`; no test presses Enter, sends only spaces, types past 500 chars (`maxlength`, chat-panel.component.html:48) or sends consecutive spaces (`chat.service.ts:62`). `chat-panel` has no spec; `chat.service.spec.ts` has 5 tests, none of these. Only the receiving side is bounded (`meeting-events.service.spec.ts:261`). | `FE/e2e/chat.test.ts:38`, `LIB/.../chat/chat.service.spec.ts:65` | Karma: `chat.service.spec.ts` (blank, collapse) plus one step in `FE/e2e/chat.test.ts:38` (Enter, limit) | high (partly closed in #270 (a blank message is not sent; Enter and the 500 character limit stay open)) |
| 153 | Late joiner sees no earlier messages | UNCOVERED | No test joins after messages were sent and opens the panel. | `FE/e2e/chat.test.ts:129` | e2e: `FE/e2e/chat.test.ts` | medium |
| 98 | Promotion grants writing live | UNCOVERED | Live updates cover guest/member permission edits (`permissions.test.ts:540,572,591`), not a promotion (a speaker without `chatWrite` promoted can send). | `FE/e2e/permissions.test.ts:591` | e2e: `FE/e2e/permissions.test.ts` (`Live permission and role updates`) | medium |
| 88 | `chatRead` revoked: button disappears and the media server rejects further messages | PARTIAL | Backend grant follows live (`generate-room-member-token.test.ts:976`); UI tests cover `chatWrite` revoked and `chatRead` granted, not `chatRead` revoked. | `FE/e2e/permissions.test.ts:572` | e2e: same file | medium |
| 75 | Promotion in a room without chat: grant still denies data publishing | UNCOVERED | Token test covers a moderator by role (`generate-room-member-token.test.ts:576`), not the promotion path (`regenerate`/`updateParticipant`). | `BE/integration/api/room-members/generate-room-member-token.test.ts:576` | integration: `BE/integration/api/meetings/update-participant.test.ts` | medium (closed in #268) |

Counts: scenarios 35, PARTIAL 1, UNCOVERED 6 (Enter, Blank, Length counted as 3 plus late joiner, promotion writing, promotion without chat).

### raise-hand

| spec line | scenario or rule | verdict | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 59 | API key tries to raise a hand: 409 | UNCOVERED | `hand.test.ts` has no API-key call at all. | `BE/integration/api/meetings/hand.test.ts:193` (moderator token) | integration: `BE/integration/api/meetings/hand.test.ts` | medium (closed in #268) |
| 131 | Leaving with a raised hand: hand leaves every queue, no `participantHandChanged` webhook; rejoin starts lowered | UNCOVERED | No test lets a participant with a raised hand leave (grep finds none in backend or UI). | `BE/integration/api/meetings/hand.test.ts:76` | integration: same file (spy as `spyOnHandWebhook`) | medium (closed in #268) |
| 242 | Raised-hand notice with a different encryption key names the holder `******` | UNCOVERED | Only the same-key notice is asserted (`e2ee.test.ts:219`). | `FE/e2e/e2ee.test.ts:219` | e2e: `FE/e2e/e2ee.test.ts` (extend wrong-key test at L280) | medium |

Counts: scenarios 36, PARTIAL 0, UNCOVERED 3.

### reactions

| spec line | scenario or rule | verdict | what is missing | nearest existing test | cheapest level / file | value |
| --- | --- | --- | --- | --- | --- | --- |
| 69 | Late joiner does not see reactions sent before | UNCOVERED | No test joins after a reaction. | `FE/e2e/participants.test.ts:850` | e2e: `FE/e2e/participants.test.ts` | medium |
| 62 | API key calling the reaction endpoint answers 401 | PARTIAL | Only "no room member token" is tested (`reaction.test.ts:184`), not the API-key header. | `BE/integration/api/meetings/reaction.test.ts:184` | integration: same file | medium (closed in #268) |
| 151 | Tray folds when the menu closes (compact toolbar) | UNCOVERED | Compact-toolbar picking is partly covered (`participants.test.ts:985`); the fold is not. | `FE/e2e/participants.test.ts:985` | e2e: same file | low |

Counts: scenarios 26, PARTIAL 1, UNCOVERED 2.

### Totals

| capability | scenarios | PARTIAL | UNCOVERED |
| --- | --- | --- | --- |
| meeting-join | 90 | 14 | 8 (+1 rule) |
| meeting-media | 100 | 8 | 13 (+1 rule) |
| meeting-layout | 56 | 6 | 3 |
| meeting-moderation | 58 | 4 | 3 |
| meeting-chat | 35 | 1 | 6 |
| raise-hand | 36 | 0 | 3 |
| reactions | 26 | 1 | 2 |

Notes on method: 401 scenarios counted with `grep -c '#### Scenario'`. Scenarios not listed were judged COVERED after reading the test (backend `generate-room-member-token`, `hand`, `reaction`, `kick`, `mute`, `update-participant` suites; `webcomponent` commands/events/attributes; SPA `permissions`, `participants`, `layout`, `stream`, `media-devices`, `e2ee`, `chat`; Karma `local-media`, `device-trial`, `meeting-event-handler`, `meeting-events`, `leave-redirect`, `meeting-join`, `meeting-entry*`). Possible spec/code concern, not a confirmed disagreement: meeting-media L101-114 requires redundant audio and silence suppression, while `local-media.service.ts:33` sets only `audioPreset` (relies on livekit-client defaults).


## From `gaps-locked-embedded.md`

Paths are relative to `/home/csantosm/CODEURJC/openvidu-meet/.claude/worktrees/no-real-waits`. `FE` = `meet-ce/frontend`, `LIB` = `meet-ce/frontend/projects/shared-meet-components/src/lib`, `WC` = `meet-ce/frontend/webcomponent/tests`, `BE` = `meet-ce/backend/tests`.
Verdicts were checked by opening test bodies; where a second grep found a unit test, the scenario is not listed. Not run, not edited.

### locked-room (spec: openspec/specs/locked-room/spec.md)

Backend (REST, Redis state, WebSocket, sweep, webhooks) and the Karma specs of `domains/meeting/waiting-participants/` cover almost every scenario. Gaps:

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value |
|---|---|---|---|---|---|---|
| 33, 41-45 | Admin and the room owner join directly (hold every permission) | PARTIAL | `mustWait` is tested only with permission objects; no test asks to join a locked room with an admin access token or as the room owner and gets a join token | `BE/unit/services/waiting-participant-admission.policy.test.ts:34-46`, `BE/unit/services/room-access.service.test.ts:147` (grants everything to an admin, no lock) | integration, `BE/integration/api/meetings/waiting-participants.test.ts` ("Asking to join"; `askToJoin` with `accessToken` of admin/owner) | medium (closed in #268) |
| 33, 59-63 | Rule "the server checks of `meeting-join` run before a participant waits" + Closed room scenario | UNCOVERED | only the 1025-char name check is tested before a wait; no test that a closed locked room answers 409 (room closed) instead of listing the speaker as waiting, nor that a reserved/duplicate name or invalid correlation field is refused before waiting | `waiting-participants.test.ts:234` (name 1025), `:692` (room closed ends waits, does not ask on a closed room) | integration, `BE/integration/api/meetings/waiting-participants.test.ts` ("Asking to join") | medium (closed in #268) |
| 735-739 | Joining without waiting: moderator with `accessBypassLock` sees button "Join Meeting" and the device setup screen | UNCOVERED | e2e helper only asserts "Ask to join" for a speaker (`waiting-participants.helper.ts:28`); the bypass holder's button label and device setup are not asserted in a locked room | `FE/e2e/helpers/waiting-participants.helper.ts:28` | e2e, `FE/e2e/locked-room.test.ts` ("Asking to join") | low |
| 747-751 | Room unlocked before asking: button still reads "Ask to join", pressing it enters the meeting without device setup, with the room's initial media settings | UNCOVERED | server side is tested (`waiting-participants.test.ts:734`); the client path (stale label, no setup screen, initial media) is not | `FE/e2e/locked-room.test.ts:190` (the opposite case, locked while choosing devices) | e2e, `FE/e2e/locked-room.test.ts` | medium |
| 226-230 | Reload after the room was unlocked: join screen shows, joining enters with the identity they waited with | PARTIAL | `meeting-entry-flow.service.spec.ts:87` shows the join screen; nothing asserts the later join keeps the identity of the earlier wait | `LIB/domains/meeting/services/meeting-entry-flow.service.spec.ts:87` | Karma, `LIB/domains/meeting/waiting-participants/waiting-participant.service.spec.ts` ("after a reload") | low |
| 533-538 | Media server refuses the admitted participant: connection error screen, not listed, place counted until a minute after admission | PARTIAL | connection error after token retries is tested (`waiting-participant.service.spec.ts:592`); the server side (not listed, place still counted for the minute after a failed connect) has no test | `BE/integration/api/meetings/waiting-participant-state.test.ts:182` (admitted ones take their places) | integration, `BE/integration/api/meetings/waiting-participants.test.ts` ("Admitting and rejecting") | low |
| 797-809 | Screen reader: admitters' notification never takes focus, its actions reachable by keyboard, status rail chip named by the number waiting | UNCOVERED | only heading focus and politeness of the waiter side are asserted (`waiting-outcome.component.spec.ts:56`, `waiting-screen.component.spec.ts:131`); no focus-stays-in-chat check, no keyboard reach, no chip accessible name | `LIB/domains/meeting/waiting-participants/waiting-participants-notice/waiting-participants-notice.component.spec.ts:105`, `LIB/domains/meeting/openvidu-components/components/status-rail/status-rail.component.spec.ts` | Karma, those two existing specs (focus unchanged on render; `aria-label` of the chip) | medium (partly closed in #270 (focus and keyboard; the chip name stays open)) |
| 957-965 | Names in encrypted rooms: decrypted with the viewer's key, masked otherwise, never encrypted; REST/webhooks/events carry the name as sent | UNCOVERED | `decryptOrMask` is stubbed as identity in the admin service spec; no test of the masked case or of an encrypted room end to end | `LIB/domains/meeting/waiting-participants/waiting-participants-admin.service.spec.ts:113` (stub) | Karma, `waiting-participants-admin.service.spec.ts` (masked vs decrypted name); e2e `FE/e2e/e2ee.test.ts` only if needed | medium (closed in #270) |
| 947-955 | Forged waiting list: a data message on the waiting topic from a participant changes no panel | PARTIAL | the generic "ignore a signal a participant forged" test uses the mute and recording topics; nothing uses the waiting-list topic, and the admin service spec has no forged case | `LIB/domains/meeting/openvidu-components/services/meeting-events/meeting-events.service.spec.ts:164` | Karma, same file (add the waiting-list topic) | low |
| 840-844 | Dismissing "You weren't let in" in an embedded element makes the host receive `embeddedCloseRequested` | PARTIAL | the unit asserts only that `goBack` is called; no WC test clicks the dismiss button of a waiting outcome and checks the event | `LIB/domains/meeting/waiting-participants/waiting-outcome/waiting-outcome.component.spec.ts:83`, `WC/e2e/events.test.ts:900` (rejection, never dismissed) | e2e, `WC/e2e/events.test.ts` ("Locked room", rejection test: click `#waiting-outcome-back-button`) | low |

Counts: scenarios 162; PARTIAL 5; UNCOVERED 5 (10 rows; the rule row and one scenario share a row).

### embedded-api (spec: openspec/specs/embedded-api/spec.md)

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value |
|---|---|---|---|---|---|---|
| 32-34 | Direct link query parameter pre-fills the name | UNCOVERED | `INTEGRATIONS` is only `webcomponent` and `iframe`; no test opens a room URL as a direct link with `participant-name` | `WC/e2e/attributes.test.ts:81` (webcomponent), `LIB/shared/utils/url.utils.spec.ts:142` (param mapping) | e2e, `FE/e2e/meeting-start.test.ts` (SPA opened directly) | medium |
| 230-236 | Direct link emits no embedded event (join and leave) | UNCOVERED | nothing spies on events of a standalone page | `LIB/domains/embedded/services/iframe-bridge.service.spec.ts:124` (no-op outside an iframe) | e2e, `FE/e2e/meeting-start.test.ts` (spy `postMessage`/`CustomEvent`) | medium |
| 111-112 | A direct link offers no commands | UNCOVERED | no test posts a command to a standalone page | same as above | e2e, `FE/e2e/meeting-start.test.ts` | low |
| 323-329 | Replaced element: new element on room B shows room B's join screen, no error | UNCOVERED | no test removes an element and adds another at once | `LIB/domains/embedded/services/wc-router.service.spec.ts:114,129` (remount, in-flight navigation discarded) | e2e, `WC/e2e/room.test.ts` ("Component Rendering") | medium |
| 88-91 | Room changed during a meeting: leaves room A, shows join screen of room B | PARTIAL | only a prejoin-to-login switch is tested; no in-meeting room switch with the leave | `WC/e2e/room.test.ts:26`, `wc-router.service.spec.ts:59` | e2e, `WC/e2e/room.test.ts` | medium |
| 83-86 | Name changed during the meeting: meeting goes on, participant keeps name | PARTIAL | unit proves a non-identity param does not re-navigate; no e2e during a live meeting | `wc-router.service.spec.ts:48`, `LIB/domains/embedded/utils/wc-route.utils.spec.ts:139` | e2e, `WC/e2e/attributes.test.ts` | low |
| 52-55 | Neither URL set: error screen and console warning that `room-url` or `recording-url` must be provided | PARTIAL | route resolves to `invalid` (`wc-route.utils.spec.ts:129`); no test of the rendered error screen or the console warning | `LIB/domains/embedded/utils/wc-route.utils.spec.ts:129` | e2e, `WC/e2e/room.test.ts` ("Component Rendering") | low |
| 201-204 | Command from another origin: warning naming that origin | PARTIAL | the untrusted-origin test only asserts the command did not run | `LIB/domains/embedded/services/iframe-bridge.service.spec.ts:234` | Karma, same file (spy `console.warn` for the origin) | low |
| 206-210 | Containing origin unknown: meeting still works | PARTIAL | bridge not started and events dropped are tested; "participant can still join and use the meeting" is not | `iframe-bridge.service.spec.ts:142,155` | e2e, `WC/e2e/events.test.ts` (iframe with referrer suppressed) | low |
| 238-247 | Event without payload: no `detail` on the DOM event, no `payload` field on the message | PARTIAL | wrapper tests dispatch events with `detail`; the no-payload shape of `embeddedCloseRequested` is not asserted on either transport | `WC/unit/wrapper.test.ts:142`, `iframe-bridge.service.spec.ts:702` | Karma/Jest, those two files | low |
| 11-12 | Attribute catalogue is exactly the 13 attributes | UNCOVERED | commands and events have a contract test, attributes do not | `BE/unit/typings/embedded-api-contract.test.ts:23,84` | unit, `BE/unit/typings/embedded-api-contract.test.ts` | low |

Counts: scenarios 48; PARTIAL 6; UNCOVERED 5 (one rule-only row).

### embedded-distribution (spec: openspec/specs/embedded-distribution/spec.md)

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value |
|---|---|---|---|---|---|---|
| 58-69 | Cross-origin requests: default `SERVER_CORS_ORIGIN` answers any origin; restricted origin only the configured one | UNCOVERED | no backend test mentions `SERVER_CORS_ORIGIN` or `Access-Control-Allow-Origin` outside the bundle route (`server.ts:53`, `environment.ts:22`) | `BE/unit/webcomponent-bundle.middleware.spec.ts:184` (bundle CORS only) | integration, `BE/integration/api/security/system-info-security.test.ts` (preflight with `Origin`) | medium (closed in #268) |
| 141-153 | Removing the element during a meeting: participant leaves, others see them leave, host receives no event; reinserting later starts anew without re-downloading the bundle | UNCOVERED | e2e removes the element only for waiting participants and in style tests; unit proves teardown and rebuild with a fake impl | `WC/unit/loader.test.ts:499`, `WC/e2e/events.test.ts:962`, `WC/e2e/room.test.ts:122` | e2e, `WC/e2e/room.test.ts` | medium (partly closed in #270 (the participant leaves and the host gets no event; reinserting stays open)) |
| 132-139 | Moving the element during a meeting keeps the participant connected and listeners firing | PARTIAL | unit proves the impl survives a move; no e2e with a real meeting | `WC/unit/loader.test.ts:479` | e2e, `WC/e2e/room.test.ts` | low |
| 78-80 | Several elements: full bundle requested once | UNCOVERED | tests count loads only for a failed bundle and the next element | `WC/unit/loader-load-failure.test.ts:114`, `WC/e2e/bundle-caching.test.ts:87` | Jest, `WC/unit/loader.test.ts` | low |
| 14-17 | Exactly two bundle URLs, no chunk from another URL | PARTIAL | caching e2e checks both URLs return 200/304; no assertion that nothing else is fetched or that the build emits one file | `WC/e2e/bundle-caching.test.ts:87` | e2e, same file (collect every script response) | low |
| 99-103 | Command before load: rejected with a warning, camera on later at device setup | PARTIAL | rejection and warning tested; "camera is on later" is not | `WC/unit/loader.test.ts:357` | e2e, `WC/e2e/commands.test.ts` | low |
| 176-181 | Fonts: one link per font stylesheet in the host `<head>` with two elements | UNCOVERED | Material Symbols dedupe is tested; the Roboto/Material Icons dedupe in `main.wc.ts:6-34` is not | `LIB/shared/icons/material-symbols.spec.ts` | e2e, `WC/e2e/room.test.ts` | low |
| 168-174 | Dialog or menu is inside the shadow root; `document.querySelector` on the host does not find it | PARTIAL | menu opened in style test, location not asserted | `WC/e2e/room.test.ts:55` | e2e, same file | low |
| 191-197 | Direct link opens the standalone app with attributes as query parameters, no channel | UNCOVERED | see embedded-api rows | none | e2e, `FE/e2e/meeting-start.test.ts` | medium |
| 50-56 | Element's requests go to the server named by `room-url` from another origin | PARTIAL | covered only implicitly by every WC e2e (testapp origin differs) | `WC/unit/loader.test.ts:553` (bundle URL only) | none needed beyond a base-URL unit assertion in `LIB/shared/services/runtime-config.service.spec.ts` | low |

Counts: scenarios 34; PARTIAL 5; UNCOVERED 5 (10 rows, the direct link row is shared with embedded-api).

### console (spec: openspec/specs/console/spec.md)

The only console unit spec is `overview.component.spec.ts`; `FE/e2e/console.test.ts` covers lists, deletion, detail tabs, password change. The shell, guards, toolbar and list navigation behaviors are untested.

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value |
|---|---|---|---|---|---|---|
| 45-51 | Admin-only pages: room manager typing `/embedded`, overview or configuration lands on rooms | UNCOVERED | no test of the console guards | `FE/e2e/console.test.ts:85` | e2e, `FE/e2e/console.test.ts` (`createReadyUser` with `room_manager`) | high (closed in #270) |
| 19-35 | Navigation lists per role, in order (admin six items; manager and member two) | UNCOVERED | no test asserts the navigation | none | e2e, `FE/e2e/console.test.ts` | medium (closed in #270) |
| 37-43 | Landing page: overview for admin, rooms for manager and member | UNCOVERED | | none | e2e, `FE/e2e/console.test.ts` | medium (closed in #270) |
| 11-17 | Unknown console path redirects to overview; unknown app path to the console | UNCOVERED | | none | e2e, `FE/e2e/console.test.ts` | low (closed in #270 and #273) |
| 53-59 | Toolbar on every page: profile button opens the profile inside the console | UNCOVERED | `console.test.ts:330` goes to `/profile` by URL | `FE/e2e/console.test.ts:322` | e2e, same file | low (closed in #273) |
| 61-72 | Theme: remembered after reload; follows the OS while nothing stored; same preference as the meeting | UNCOVERED | `theme.service.spec.ts` covers root element placement only | `LIB/shared/services/theme.service.spec.ts:53` | Karma, same file (stored, OS preference, `matchMedia` change) | medium (partly closed in #270 (stored theme against the OS preference)) |
| 74-80 | Collapsed navigation: icons with tooltips; expanded shows version and edition | UNCOVERED | | none | e2e, `FE/e2e/console.test.ts` | low (closed in #273) |
| 102-109 | Getting-started actions open the wizard, configuration and embedded pages | PARTIAL | the view and the create button exist in the unit; navigation of the three actions not asserted | `LIB/domains/console/pages/overview/overview.component.spec.ts:201` | Karma, same file | low |
| 135-138 | `getAnalytics` after a room is deleted counts one less | UNCOVERED | no test deletes then reads; statuses and expiry are covered | `BE/integration/api/analytics/get-analytics.test.ts:77` | integration, same file | medium |
| 156-162 | Embedded page link follows `MEET_BASE_PATH` (`/video/api/v1/docs/`) | UNCOVERED | | none | Karma, new case; nearest file `LIB/domains/console/pages/overview/overview.component.spec.ts` (no embedded page spec exists) | low |
| 164-170 | Room detail keeps the console shell (navigation, toolbar) for a room manager | UNCOVERED | | `FE/e2e/console.test.ts:247` | e2e, same file | low (closed in #273) |
| 172-178 | Clicking a row opens the item on rooms, recordings, users | PARTIAL | only rooms name cell and users name cell are clicked; recordings row and clicking outside buttons/links not tested | `FE/e2e/console.test.ts:104,209` | e2e, same file | medium (closed in #273) |
| 180-184 | Selecting text does not open the item | UNCOVERED | | none | e2e, same file | medium (closed in #273) |
| 186-189 | Ctrl or Cmd click opens a new tab, list unchanged | UNCOVERED | | none | e2e, same file | medium (closed in #273) |
| 191-195 | `room_member` recordings list: room id links to the room; own id on Users opens profile | UNCOVERED | | none | e2e, same file | medium (closed in #273) |
| 200-204 | Filter and sort go into the URL; reload shows the same list | PARTIAL | `ListUrlState` read/write unit-tested; no e2e of the page | `LIB/shared/models/list-url-state.spec.ts:42` | e2e, `FE/e2e/console.test.ts` | medium (closed in #273) |
| 206-209 | Back after opening a filtered recording restores filter and fresh data | PARTIAL | back test uses unfiltered users; no filter, no recordings | `FE/e2e/console.test.ts:209` | e2e, same file | low (closed in #273) |
| 216-222 | Room detail tab kept in the URL (member edit page, back, Members tab selected) | UNCOVERED | | `FE/e2e/console.test.ts:247` | e2e, same file | medium (closed in #273) |
| 224-235 | Lists keep rows dimmed while reloading; placeholder rows when empty | PARTIAL | loading flags unit-tested, rendering (dimmed, not clickable, placeholders) not | `LIB/shared/models/entity-list.model.spec.ts:83` | e2e, `FE/e2e/console.test.ts` (delay route) | low (closed in #273) |
| 237-244 | Embedded page shows title and both sections with placeholders while loading | UNCOVERED | | none | e2e, same file | low (closed in #273) |

Counts: scenarios 44; PARTIAL 5; UNCOVERED 15 (20 rows; navigation row counts 3 scenarios, placeholder row 2).

### appearance (spec: openspec/specs/appearance/spec.md)

Backend (validation, roles, anonymous read, merge of omitted colors) is fully covered by `BE/integration/api/global-config/appearance.test.ts` and `BE/integration/api/security/global-config-security.test.ts`. The whole frontend is untested: no spec for `config.component.ts`, `meeting.component.ts` theme effect or `FeaturesUtils.applyAppearanceConfig` (`features.utils.ts:94`); no e2e mentions a theme.

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value |
|---|---|---|---|---|---|---|
| 100-108 | Enabled theme overrides participant preference, hides selector, keeps stored preference | UNCOVERED | `applyAppearanceConfig` and the `setTheme(base, false)` call are never exercised | `LIB/domains/rooms/utils/features.utils.spec.ts` (no theme case), `LIB/shared/services/theme.service.spec.ts` | Karma, `features.utils.spec.ts` | high (closed in #270) |
| 87-98 | Branded meeting and embedded meeting: base theme and five colors reach the join screen and the meeting; unset color keeps default | UNCOVERED | no test maps theme colors to the `--ov-*` variables | `WC/e2e/room.test.ts:93` (theme variable in the element, no appearance config) | e2e, `WC/e2e/room.test.ts` (admin API sets theme, read computed variable); SPA side `FE/e2e/layout.test.ts` | high (partly closed in #270 (the join screen is painted; the meeting is not checked)) |
| 110-117 | Disabled theme keeps default look, participant preference and selector; stays stored | UNCOVERED | | none | Karma, `features.utils.spec.ts` | medium (closed in #270) |
| 14-17 | Every room shares the theme | UNCOVERED | | none | e2e, same as above | low |
| 119-126 | Change during a meeting is not applied until reload; later joiners see it | UNCOVERED | | none | e2e, `FE/e2e/layout.test.ts` | low |
| 128-135 | Console page: nothing stored, switch off, turning on shows light defaults | UNCOVERED | no config page test | `FE/e2e/console.test.ts` | e2e, `FE/e2e/console.test.ts` | medium (closed in #273) |
| 137-144 | Saving stores theme `default`, enabled, picked color plus base defaults for the other four, confirmation | UNCOVERED | | none | e2e, same file | medium (closed in #273) |
| 146-152 | Switch off of a stored enabled theme saves at once keeping colors | UNCOVERED | | none | e2e, same file | medium (closed in #273) |
| 154-160 | Base change replaces only colors still at the previous default | UNCOVERED | pure logic in `config.component.ts`, no spec | none | Karma, new case; no existing config spec (nearest file `LIB/domains/console/pages/overview/overview.component.spec.ts`), else e2e `FE/e2e/console.test.ts` | medium (closed in #273) |
| 162-168 | Reset colors restores stored values and disables itself; disabled while nothing differs | UNCOVERED | | none | same as above | low (closed in #273) |
| 61 | Malformed JSON body gets 400 | UNCOVERED | only 422 cases tested | `BE/integration/api/global-config/appearance.test.ts:319` | integration, same file | low |

Counts: scenarios 23; PARTIAL 0; UNCOVERED 10 scenarios + 1 rule.

### localization (spec: openspec/specs/localization/spec.md)

Language resolution is well covered by `translate.service.spec.ts` (LanguageService block) and `WC/e2e/attributes.test.ts` ("with language", recording screens, iframe, auto).

| spec line | scenario or rule | PARTIAL/UNCOVERED | what is missing | nearest existing test | cheapest level and file | value |
|---|---|---|---|---|---|---|
| 26-32 | First visit from a German browser without stored choice shows English | UNCOVERED | the unit stubs a stored `de`; no case with nothing stored and `navigator.languages` German | `LIB/shared/services/i18n/translate.service.spec.ts:281-300` | Karma, same file | medium (closed in #270) |
| 55-61 | Language chosen in the console applies when entering a meeting from it | UNCOVERED | shared preference is tested inside one service; no e2e crossing console and meeting | `FE/e2e/console.test.ts:289` | e2e, `FE/e2e/console.test.ts` | medium (closed in #273) |
| 110-113 | Participant's pick kept when the host sets `room-url` to another room with `language` unchanged | UNCOVERED | | `WC/e2e/attributes.test.ts:325` | e2e, `WC/e2e/attributes.test.ts` | medium |
| 162-165 | `show-language-selector` is per entry: next entry without it shows the selectors | UNCOVERED | unit only toggles `setSelectorVisible` | `translate.service.spec.ts:376`, `WC/e2e/attributes.test.ts:364` | e2e, `WC/e2e/attributes.test.ts` | medium |
| 170-173 | Role change notice shown in Spanish | PARTIAL | handler tests assert translation keys (`MODERATION.PROMOTED_TO_MODERATOR`), not rendered text in Spanish | `LIB/domains/meeting/services/meeting-event-handler.service.spec.ts:746` | e2e, `FE/e2e/permissions.test.ts` | low |
| 175-178 | Error screen "Invalid link" in French | UNCOVERED | only English text is asserted | `WC/e2e/events.test.ts:253` | e2e, `FE/e2e/access.test.ts` | low |
| 183-186 | `meetingLeft` carries `voluntary_leave` with the meeting in Japanese | UNCOVERED | reason asserted only in English meetings | `WC/e2e/events.test.ts:141-181` | e2e, `WC/e2e/events.test.ts` | low |
| 196-199 | Room closed instead of deleted: notice in French | UNCOVERED | only the "deleted" and "copied link" notices are tested | `FE/e2e/console.test.ts:306` | e2e, `FE/e2e/console.test.ts` | low (closed in #273) |
| 21-24 | Selector lists the ten languages under their own names | UNCOVERED | `DEFAULT_LANGUAGE_OPTIONS` never asserted | `translate.service.spec.ts:266` (code mapping only) | Karma, same file | low |
| 37-40 | Settings panel General tab shows a language selector | PARTIAL | only absence (hidden case) is asserted | `WC/e2e/attributes.test.ts:364` | e2e, `FE/e2e/panels.test.ts` | low |

Counts: scenarios 28; PARTIAL 2; UNCOVERED 8.

### Totals

| capability | scenarios | gaps (rows) | PARTIAL | UNCOVERED |
|---|---|---|---|---|
| locked-room | 162 | 10 | 5 | 5 |
| embedded-api | 48 | 11 | 6 | 5 |
| embedded-distribution | 34 | 10 | 5 | 5 |
| console | 44 | 20 | 5 | 15 |
| appearance | 23 | 11 | 0 | 11 (10 scenarios + 1 rule) |
| localization | 28 | 10 | 2 | 8 |

### Possible spec/code disagreements

None confirmed. Checked: fonts (`meet-ce/frontend/webcomponent/src/main.wc.ts:6-34` adds Roboto and Material Icons, Material Symbols come from `provideMaterialSymbols`), CORS default (`meet-ce/backend/src/environment.ts:22` is `*`), unlock during a meeting (409 via the generic access-update guard, `update-room-access-config.test.ts:163`).
