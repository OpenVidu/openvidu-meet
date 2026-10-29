# Changelog

Every release groups its `Added`, `Improved` and `Fixed` entries by who the change reaches:

- **Integration**: the REST API, the webhooks and the embedded API, the surfaces a host
  application is built against.
- **UI**: the meeting and the console, what a person using Meet sees.
- **Deployment**: configuration, limits and running the server.

## 3.10.0 (unreleased)

### Upgrade notes

- Meet no longer starts when `MEET_INITIAL_ADMIN_USER` is shorter than 5 characters.

### Added

#### Integration

- Embedded commands `recordingStart` and `recordingStop`, gated by `recordingControl`, and the embedded event
  `recordingStatusChanged`, carrying `{ recordingId, status }` to every participant.
- Embedded attributes and URL parameters `language`, which sets the initial interface language, meeting and
  recording screens alike (a BCP 47 language tag, or `auto` for the browser's), over the participant's stored
  preference without replacing it, and `show-language-selector`, which hides the language selectors when `false`.
- Embedded command `participantUpdateRole`, gated by `participantPromote`, promotes a participant to moderator or
  demotes them back. Every promotion and demotion is reported as the
  [`participantRoleChanged`][3.10-participant-role-changed] webhook and as the embedded event of the same name to the
  affected participant.
- Raise hand, in the meeting and through the REST API, the embedded commands `participantHandRaise`,
  `participantHandLower` and `participantHandLowerAll` and the embedded event and webhook `participantHandChanged`,
  with the `participantHandLower` permission to lower other participants' hands and the room config
  `raiseHand.enabled` to turn it off.
- Reactions, in the meeting and through the embedded command `participantReactionSend` and the embedded event
  `participantReactionSent`, with the `participantReactionSend` permission to send them and the room config
  `reactions.enabled` to turn them off.
- User responses carry `isRootAdmin`, `true` for the `MEET_INITIAL_ADMIN_USER` account.

#### Deployment

- Azure Blob Storage authenticates with the Azure managed identity of the VM or pod running Meet when
  `MEET_AZURE_ACCOUNT_KEY` is empty.

### Improved

#### Integration

- The embedded event `participantLeft` carries the participant's `leaveReason`, the same one the
  [`participantLeft`][3.9-participant-left] webhook carries.

#### UI

- The meeting settings panel takes the width of the other panels and groups its options in three tabs: Audio &
  video, with a camera preview, on and off switches and a microphone level meter; Layout, which More options >
  Adjust layout opens directly and which also sets the own video floating or in the grid; and General.

### Fixed

#### Integration

- A room member token issued before its participant was demoted through
  [`participantRoleUpdate`][3.10-participant-role-update] or `participantUpdateRole` stayed valid until it expired,
  so they kept their moderator permissions. It is now rejected.
- [`participantRoleUpdate`][3.10-participant-role-update], [`participantMute`][3.9-participant-mute],
  [`participantMuteAll`][3.9-participant-mute-all], `updateRoomMember` and the embedded commands that use them
  answered with an error when the notice to the affected participants could not be delivered, although the change
  was already applied. They now succeed.
- Two simultaneous [`participantRoleUpdate`][3.10-participant-role-update] requests for the same participant both
  succeeded, and a promotion made while the participant's token was being regenerated could be undone by it. Both
  now apply one after the other, so the second promotion answers `409`.
- [`participantKick`][3.9-participant-kick] and the embedded command of the same name could disconnect the recorder
  of a recording in progress or the live captions assistant, which `participantGet` answers as not in the meeting.
  They now answer the same 404 for them.
- The embedded commands `meetingEnd` and `endMeeting` reported `meeting_ended` in the `meetingLeft` event of the
  participant whose host ended the meeting. They now report `meeting_ended_by_self`, as ending it from the leave menu
  does.
- The `joinDate` of the embedded event `participantJoined` was the moment the join reached the browser, by the
  browser's clock, and the one of `participantLeft` was rounded down to the second. Both now carry the `joinDate` of
  the [`participantJoined`][3.9-participant-joined] webhook.
- The [`meetingEnded`][3.9-meeting-ended] webhook could be sent twice for one meeting when the media server's notice
  of its end and the periodic meeting status check handled it at the same time. It is now sent once.
- [`startRecording`][3.9-start-recording] checked the target room before `recordingControl`, so a room member token of
  another room got `404` for a room that does not exist and learned whether a room could be recorded. It now answers
  `403` first.
- [`startRecording`][3.9-start-recording] answered `500` when the media server did not accept the recording, and `500`
  or `409` (no participants) when it could not be reached. It now answers `503`.
- [`stopRecording`][3.9-stop-recording] answered `404` for a recording that had ended more than 24 hours earlier. It
  now answers `409`, as for any recording already stopped.
- [`bulkDeleteRecordings`][3.9-bulk-delete-recordings] and [`downloadRecordings`][3.9-download-recordings] accepted any
  number of `recordingIds`, and a long list failed with a server or proxy error. They now accept up to 100 distinct ids
  and answer `422` to more, and the recording lists disable ZIP download and bulk delete beyond 100 selected
  recordings.
- A recording ended by the stale-recordings clean-up sent no [`recordingEnded`][3.9-recording-ended] webhook and stayed
  in progress in the meeting and for the embedded event `recordingStatusChanged`. Its end is now reported like any
  other, once.
- The access token of a user with a pending password change also reached public endpoints whose path ends in `/me`
  or `/change-password`, such as `GET /api/v1/users/me`. Only `getMe` and `changeUserPassword` accept it now.
- Two simultaneous API key regenerations could leave two API keys, both accepted. Exactly one remains now, the last
  one generated.
- Logging out, changing one's own password and refreshing with rotation left the earlier user tokens valid until
  they expired. `logoutUser` now revokes the session's tokens, `changeUserPassword` revokes every earlier token of
  the user and returns new ones, and a rotated refresh token is accepted once.
- Two simultaneous [`createUser`][3.10-create-user] requests with the same `userId` could answer `500`. The one that
  finds the `userId` taken now answers `409`.
- [`updateRoomStatus`][3.10-update-room-status] with `open` during a meeting set the room `open` while the meeting
  went on, cancelling a scheduled close or deletion and sending a second `meetingStarted` webhook, and `closed` turned
  a scheduled deletion into a close. During a meeting the room now stays `active_meeting`: `open` cancels only a
  scheduled close and answers `409` when a deletion is scheduled, and `closed` keeps a scheduled deletion.
- The room returned by `deleteRoom` and `bulkDeleteRooms` carried its `roles` with the current permission keys only. It
  now carries the deprecated `can*` keys next to them, as every other room response does.
- `getRoomMember` answered `404` for a member that does not exist before checking the caller, so a caller without
  access could tell which `memberId` values belong to the room. Such a caller now gets `403` whether or not the member
  exists.
- A permission change made with `updateRoomMember` during a meeting reached the media server only when the
  participant's client renewed its token, so a client that skipped the renewal kept publishing what it had lost. The
  server now applies the new media grant at once.
- An `updateRoomMember` that changed nothing, such as one with an empty body, revoked the member's room member tokens
  and told a member in the meeting that their permissions were updated. Only an update that changes the member's
  effective permissions does so now.
- The name an identified guest, a member user or a signed-in user joined a meeting with was locked by the join screen
  only, so a modified client could join under any name. Outside encrypted rooms the server now uses the member's or
  the user's name.
- `chatRead` was enforced in the interface only: every chat message reached every participant's client. Messages now
  reach only the participants holding `chatRead`.
- A room's `config.chat.enabled` `false` was enforced in the interface only, so a modified client holding `chatWrite`
  could still send chat messages. The media server now refuses them.
- A room with end-to-end encryption could have live captions on, although the captions assistant only receives
  encrypted audio and produced no captions. As with recording, `captions.enabled` is now stored as `false` while
  `e2ee.enabled` is `true`, in existing rooms too, and the room wizard turns captions off when encryption is turned on.
- Registering the same callback twice with `on()` on `<openvidu-meet>` called it twice per event and left one
  registration that `off()` could not remove, and a callback registered with `once()` could not be removed with
  `off()`. A callback is now registered once per event, and `off()` removes it however it was added.
- A join refused because `participant-external-id` or `participant-metadata` exceed their limits showed the generic
  error screen. It now shows an "Invalid participant data" error screen and logs the server's reason in the browser
  console.
- The styles of `<openvidu-meet>` reached the host page, restyling its own elements such as Angular Material
  components, and the host page's `<style>` rules reached inside the element. Each side's styles now stay on its side
  of the element's shadow root.
- Meet in an iframe did not post `embeddedCloseRequested` to the host page from a recording screen or from an access
  error screen shown before the join screen, and dropped commands posted before the join screen without a console
  warning. It now listens to the host page and posts events from the moment it loads.
- With `leave-redirect-url` set, the redirect could replace the host page before `embeddedCloseRequested` reached it,
  in the embedded element and in the iframe. The redirect now follows the event.
- A room URL opened in an iframe or a direct link with `show-only-recordings` and no value, or a value other than
  `true` such as `1`, showed the meeting. It now shows the room recordings page unless the value is `false`, as the
  attribute of `<openvidu-meet>` does.

#### UI

- After leaving a meeting that was being recorded, joining another meeting with the same `<openvidu-meet>`
  element showed that recording as still in progress. The recording indicator starts over with each meeting.
- After leaving a meeting, joining another meeting with the same `<openvidu-meet>` element showed the earlier
  meeting's chat messages and counted them as unread. The chat now starts empty in every meeting.
- A browser tab, or an `<openvidu-meet>` element, that had entered a room with a secret or an encryption key reused
  them for any other room entered without them, so a user access link opened afterwards showed the "Invalid link"
  error screen. They are now kept only for the room they were given for.
- On the join screen of a meeting in an iframe without `leave-redirect-url`, a signed-in user got a **Back to Rooms**
  button that only emitted `embeddedCloseRequested`, and an anonymous participant got none. The iframe's access error
  screens, and a recording opened in an iframe by its link, offered no button either. The join, error and recording
  screens of an iframe now always offer one that emits `embeddedCloseRequested`, as its end screen does.
- A room member or user who joined a meeting again before their earlier session had left it, from a second tab, after
  reloading or by rejoining quickly, was renamed with a numeric suffix such as `Ana_1` everywhere the meeting shows or
  reports names. They now keep their name.
- A participant promoted and demoted in quick succession, or whose permissions changed right after their role, could
  be left with the permissions of the earlier change. The changes are now applied in the order they happen.
- A participant promoted and demoted several times in a row got one notice per change, stacked over the meeting. Only
  the notice of their current role is shown now.
- A participant promoted to moderator or demoted while still joining a meeting kept the permissions of the role they
  joined with. They now get the new role's permissions, and its notice, once in the meeting.
- A participant whose room member token could not be renewed for a moment, because the server was unreachable or
  failing, was taken out of the meeting to an access-revoked error page. They now stay in the meeting, and only losing
  access to the room takes them out.
- The notices a participant sees when promoted to moderator, demoted or given updated permissions were always in
  English. They now follow the selected language.
- In a narrow desktop browser window, the meeting toolbar overflowed the screen and hid some of its buttons. A window
  narrower than 768 px now gets the compact toolbar a phone gets.
- On a phone, the status rail overflowed the screen and hid its last chips, such as the participants left out of the
  layout. Narrower than 790 px, the raised hands, the reactions and the participants left out of the layout now move
  to a second row of the rail when they do not fit beside the rest.
- The microphone button of the meeting toolbar stayed enabled while the microphone was being turned on or off, so a quick
  second press started the opposite change before the first one ended. It is now disabled until the change ends, like
  the camera button.
- The notifications in the top corner of a meeting covered the header of an open side panel, its close button
  included. They now sit beside the panel, or below its header when the panel fills the screen.
- In a chat message, a bare domain followed by a query or a fragment, such as `example.com?x=1`, was linked without
  them. The whole address is linked now.
- The notices of the console room detail page about copying a member's link, removing members and failing to load
  members or recordings were always in English. They now follow the selected language.
- The recording lists of the console and the room recordings page offered play and share on every recording, even to a
  user or room member without `recordingPlay`, and those actions then failed. They are now disabled, with a tooltip,
  without `recordingPlay`.
- The console treated the earliest registered user as the root admin, so after a change of
  `MEET_INITIAL_ADMIN_USER` it protected the wrong account. It now protects the `MEET_INITIAL_ADMIN_USER` account.
- In a room whose anonymous speaker access is disabled, the meeting still offered the anonymous speaker link to share,
  a link every recipient was refused with. The meeting no longer offers it.

#### Deployment

- A `SERVER_TRUST_PROXY` subnet in IPv4-mapped IPv6 notation with a short prefix, such as `::ffff:10.0.0.0/8`,
  trusted every client as a proxy, so rate limiting took the client address from `X-Forwarded-For`. Such a
  subnet no longer matches every IPv4 address.
- A request with a compressed body followed by extra bytes could stop the server, with no authentication needed.
  Such a request no longer does.
- An unknown `MEET_BLOB_STORAGE_MODE` value, including `GCS` or `ABS` in capitals, made Meet use S3 storage. Values
  now match in any case, and any other value stops startup naming the variable.
- With `MEET_BLOB_STORAGE_MODE=abs`, recordings were written under `MEET_S3_SUBBUCKET` but read under
  `MEET_AZURE_SUBCONTAINER_NAME`, so they could not be played, downloaded or deleted when the two differed. They are
  now written under `MEET_AZURE_SUBCONTAINER_NAME`.
- A `MEET_S3_SUBBUCKET` or `MEET_AZURE_SUBCONTAINER_NAME` that begins the recordings path, such as `rec` or
  `recordings`, made Meet look for recordings outside the prefix they were written under, so they could not be played,
  downloaded or deleted. They are now read under the prefix.
- A `MEET_INITIAL_ADMIN_USER` or `MEET_INITIAL_ADMIN_PASSWORD` shorter than 5 characters created a root admin that
  could never log in. Meet now refuses to start with such a value and names the variable.

## 3.9.0

This release deprecates the old permissions, commands and events, and adds a new set of them. The new and old names run alongside each other for compatibility **until 3.12.0**, when the old names are removed.

### Breaking changes

**None.**

### Deprecated

The names below still work in this release and are removed in **3.12.0**. Requests accept either
key set, and responses and webhooks carry both.

| Deprecated permission        | Replacement                                           |
| ---------------------------- | ----------------------------------------------------- |
| `canRecord`                  | `recordingControl`                                    |
| `canRetrieveRecordings`      | `recordingList`, `recordingPlay`, `recordingDownload` |
| `canDeleteRecordings`        | `recordingDelete`                                     |
| `canJoinMeeting`             | `meetingJoin`                                         |
| `canEndMeeting`              | `meetingEnd`                                          |
| `canMakeModerator`           | `participantPromote`                                  |
| `canKickParticipants`        | `participantKick`                                     |
| `canPublishAudio`            | `mediaPublishAudio`                                   |
| `canPublishVideo`            | `mediaPublishVideo`                                   |
| `canShareScreen`             | `mediaShareScreen`                                    |
| `canChangeVirtualBackground` | `mediaChangeVirtualBackground`                        |
| `canReadChat`                | `chatRead`                                            |
| `canWriteChat`               | `chatWrite`                                           |
| `canShareAccessLinks`        | `roomShareAccessLinks`                                |

| Deprecated        | Replacement              | Kind    |
| ----------------- | ------------------------ | ------- |
| `endMeeting`      | `meetingEnd`             | command |
| `leaveRoom`       | `meetingLeave`           | command |
| `kickParticipant` | `participantKick`        | command |
| `joined`          | `meetingJoined`          | event   |
| `left`            | `meetingLeft`            | event   |
| `closed`          | `embeddedCloseRequested` | event   |

Both command name sets are accepted. Every event is emitted under both names, so a listener
registered on both receives it twice.

### Added

#### Integration

- [Meetings API][3.9-meetings] under `/api/v1/meetings`: read a live meeting, end it, list and read its
  participants, and kick or promote them. It accepts API keys and room member tokens, and reading uses the new
  [`meetingRead`][3.9-permissions] permission.
- A member with the new [`participantMute`][3.9-permissions] permission, granted to the moderator role of
  rooms created from this release on (speakers need it granted explicitly), can mute a
  participant's microphone, camera or screen share, one at a time or everyone at once, over the meetings API
  ([`participantMute`][3.9-participant-mute], [`participantMuteAll`][3.9-participant-mute-all]) or with the
  embedded commands of the same names. A moderator cannot be muted, and muting everyone leaves the caller
  alone.
- Embedded commands `mediaToggleAudio`, `mediaToggleVideo` and `mediaToggleScreenShare` for the local
  participant's own media, reported by `mediaAudioStatusChanged`, `mediaVideoStatusChanged` and
  `mediaScreenShareStatusChanged`, carrying `{ active, origin }`.
- Participants arriving and leaving are reported as the webhooks [`participantJoined`][3.9-participant-joined]
  and [`participantLeft`][3.9-participant-left], the second carrying `leaveDate`, `durationSeconds` and
  `leaveReason`, and as embedded events of the same names for remote participants.
- Embedded attributes `participant-external-id` and `participant-metadata`, travelling as `externalId` and
  `metadata` in participant payloads.
- [Webhooks API][3.9-webhooks-api] under `/api/v1/webhooks`, replacing the single global webhook
  configuration. Each webhook carries its own event filter and room scope, and is managed with an API key or
  an administrator's token.
- [`GET /api/v1/recordings/{recordingId}/download`][3.9-download], permissioned through `recordingDownload`
  separately from `recordingPlay`.
- [Room configuration][3.9-room-config] `config.maxParticipants` (1 to 30) and `config.maxDurationMinutes` (1
  to 1440). Reaching the duration limit ends the meeting with `reason: max_duration_reached` on the
  [`meetingEnded`][3.9-meeting-ended] webhook and `reason: meeting_ended_by_duration_limit` on the embedded
  `meetingLeft` event.
- [Room configuration][3.9-room-config] `config.recording.autoStart`, at `when_first_participant_joins`,
  `when_second_participant_joins` or `when_moderator_joins`.
- [Room configuration][3.9-room-config] `config.initialAudioActive` and `config.initialVideoActive`,
  overridden per embed by the attributes `initial-audio-active` and `initial-video-active`.

#### UI

- A status rail above the meeting layout (elapsed meeting time, recording, duration countdown, encryption,
  hidden participants), and notices when a recording starts and stops.
- A participant who speaks while muted is told, and so is one whose microphone the operating system has
  muted rather than Meet.
- Media controls in the participants panel: the microphone, camera and screen share state of every
  participant, and per-device mute controls next to **Promote** and **Kick**.
- The meeting limits and the initial media state in the room wizard, and copyable room ids.

### Improved

#### Integration

- REST API requests validate through precompiled schemas, reducing response times.

#### UI

- Screen shares can be zoomed with two fingers on touch devices.
- Meeting layout performance improvements.
- Device permissions are requested in a single prompt.
- The floating or docked choice for the local video tile is remembered per browser.

#### Deployment

- Rate limits for token issuance, API requests and static assets were raised.
- `MEET_INITIAL_ADMIN_USER`, `MEET_INITIAL_API_KEY` and `MEET_INITIAL_WEBHOOK_URL` seed their item on every start while the deployment has none, instead of on the first start only.
- The `openvidu/openvidu-meet` Docker image is 41% smaller and no longer contains pnpm, bash or `meet.sh`.

### Fixed

#### Integration

- A participant could grant themselves moderator permissions by modifying their own role and identity data. Roles and permissions are decided by the server alone.
- `chatWrite` permission was enforced in the interface only. It is enforced at the media server, at join time and when permissions change mid-meeting.
- Revoking a member's media permissions mid-meeting did not reach the media server, so the participant kept publishing.
- Ended meetings could stay marked as running, which blocked duration limits and room configuration changes from taking effect.
- A stale reconnect could reopen a closed room.
- A recording's [`startDate`][3.9-recording] was the moment the recording was requested, not the moment it started recording media.
- [`POST /recordings`][3.9-start-recording] waited 20 seconds until the meeting has participants publishing media. Now there is no timeout.
- Deleting a recording could fail on an error payload with missing fields.
- Re-entering a meeting in the same web component instance wiped or froze the entry attributes.
- A room's `autoDeletionDate` could be set so far in the future that it was never honored, leaving the room stuck forever. It now has an upper limit.
- `DELETE /rooms` reset the connection instead of answering when `roomIds` grew large enough to exceed the runtime's header size limit. Now roomIds are limited to 100
- [`POST /rooms`][3.9-create-room] failed when `roomName` was empty. Now, default value `Room` is used when `roomName` is empty, blank or `null`.

#### UI

- The local video disappeared from the layout when the last remote participant left.
- The first meeting a browser opened saved its layout and number of visible participants as the participant's choice. They are saved only when the participant changes them in the settings panel.
- A virtual background or blur froze for other participants when the sending window was minimized or covered, in Firefox and Safari.
- Abandoned wizard state leaked into the next room, and a failed save reset the form.

#### Deployment

- Unanswered webhooks caused active connections to grow continuously. Every webhook is answered.
- The `openvidu/openvidu-meet` Docker image resolved its dependencies anew on every build instead of installing the versions in the lockfile. It now installs the locked versions.

[3.10-create-user]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/createUser
[3.10-participant-role-changed]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/webhooks/participantRoleChangedWebhook
[3.10-participant-role-update]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/participantRoleUpdate
[3.10-update-room-status]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/updateRoomStatus
[3.9-api]: https://openvidu.io/3.9/meet/embedded/reference/api.html
[3.9-meetings]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/meetingGet
[3.9-webhooks-api]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/webhookList
[3.9-participant-joined]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/participantJoinedWebhook
[3.9-participant-left]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/participantLeftWebhook
[3.9-meeting-ended]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/meetingEndedWebhook
[3.9-participant-mute]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/participantMute
[3.9-participant-mute-all]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/participantMuteAll
[3.9-participant-kick]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/participantKick
[3.9-download]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/downloadRecording
[3.9-room-config]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/schemas/MeetRoomConfig
[3.9-permissions]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/schemas/MeetPermissions
[3.9-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/schemas/MeetRecording
[3.9-create-room]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/createRoom
[3.9-start-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/startRecording
[3.9-stop-recording]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/stopRecording
[3.9-recording-ended]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/webhooks/recordingEndedWebhook
[3.9-bulk-delete-recordings]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/bulkDeleteRecordings
[3.9-download-recordings]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/downloadRecordings
