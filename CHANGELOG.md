# Changelog

Every release groups its `Added`, `Improved` and `Fixed` entries by who the change reaches:

- **Integration**: the REST API, the webhooks and the embedded API, the surfaces a host
  application is built against.
- **UI**: the meeting and the console, what a person using Meet sees.
- **Deployment**: configuration, limits and running the server.

## 3.10.0 (unreleased)

### Upgrade notes

- The first start migrates the stored rooms and room members, and a 3.9 server does not start on the migrated
  database.
- Meet no longer starts when `MEET_INITIAL_ADMIN_USER` is shorter than 5 characters.
- Meet no longer starts with a `MEET_BLOB_STORAGE_MODE` other than `s3`, `gcs` or `abs`, which 3.9 took as `s3`.
- A `SERVER_TRUST_PROXY` subnet in IPv4-mapped IPv6 notation with a prefix shorter than 96, such as
  `::ffff:10.0.0.0/8`, matches no IPv4 address, so the proxies it named are no longer trusted.
- Existing rooms get raise hand and reactions turned on, and live broadcast turned off, with `broadcastControl` and
  `broadcastEdit` granted to no role or member.
- Webhooks registered without `events`, the one of `MEET_INITIAL_WEBHOOK_URL` included, also receive
  `participantRoleChanged`, `participantHandChanged`, `broadcastStarted`, `broadcastUpdated` and `broadcastEnded`.

### Deprecated

The link form below still works in this release and is removed in **3.13.0**. Removing such a guest and adding them
again gives the guest a link of the current form and a new `memberId`.

| Deprecated                                                                                   | Replacement                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The `accessUrl` of an identified guest added before 3.10.0, whose `secret` is the `memberId` | The `accessUrl` whose `secret` is the `memberId`, a `-` and a random part, which every guest added from 3.10.0 gets |

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
- [Broadcasts API][3.10-broadcasts] under `/api/v1/broadcasts`: stream a live meeting to one or more RTMP
  destinations, one broadcast per destination, each with its own status and its own `broadcastId`, as a
  recording has, read them and stop one or several, in a room whose `config.broadcast.enabled` is `true` (`false` by
  default). Starting and stopping use the new [`broadcastControl`][3.10-permissions] permission and streaming to a
  destination the room does not have uses `broadcastEdit`, both granted to the moderator role of rooms created from
  this release on, and reading them uses `meetingRead`. The embedded API
  gets the `broadcastStart` and `broadcastStop` commands and the `broadcastStarted`, `broadcastUpdated` and
  `broadcastEnded` events, the webhooks [`broadcastStarted`][3.10-broadcast-started],
  [`broadcastUpdated`][3.10-broadcast-updated] and [`broadcastEnded`][3.10-broadcast-ended] report the same, and
  the [meeting info][3.10-meetings] carries `broadcastActive`.
- Rooms save the destinations a broadcast streams to by default, and the layout and encoding it streams
  with, in [`config.broadcast`][3.10-room-config].
  Every response replaces the stream key of a destination URL with `********`, and a redacted URL sent back
  keeps the saved key.
- User responses carry `isRootAdmin`, `true` for the `MEET_INITIAL_ADMIN_USER` account.

#### UI

- The room wizard gets a Broadcast step to save the room's default RTMP destinations and layout, the meeting's activities
  panel a Live broadcast activity to go live to them, add one for the meeting, and stop or restart each, and
  the status rail a `LIVE` chip with the time on air.
- The device setup screen shows the microphone's live level in its microphone button, and its camera, microphone and
  background effects controls are split controls with a separate toggle and menu button.

#### Deployment

- Live broadcasts need the OpenVidu egress, which reports the tag Meet gives each stream URL.
- Azure Blob Storage authenticates with the Azure managed identity of the VM or pod running Meet when
  `MEET_AZURE_ACCOUNT_KEY` is empty.

### Improved

#### Integration

- The embedded event `participantLeft` carries the participant's `leaveReason`, the same one the
  [`participantLeft`][3.9-participant-left] webhook carries.
- `chatWrite` lets a participant send chat messages only together with `chatRead`, and
  `mediaChangeVirtualBackground` offers background effects only together with `mediaPublishVideo`. The room
  wizard and the member form disable each of these switches while the permission it needs is off.

#### UI

- The meeting settings panel takes the width of the other panels and groups its options in three tabs: Audio &
  video, with on and off switches and a camera preview and a microphone level meter that, in Chrome, Edge and
  Firefox on a computer, show a picked camera or microphone before Apply switches the one the others receive;
  Layout, which More options > Adjust layout opens directly and which also sets the own video floating or in the
  grid; and General.
- The microphone is sent at speech quality, 24 kbps instead of 48 kbps.
- The audio of a shared screen is captured as played, without echo cancellation, noise suppression or automatic
  gain control.
- The console lists of rooms, recordings and users no longer open an item at the end of a text selection, open it in a
  new tab on a Ctrl or Cmd click, and show the ids of rooms and users as links, the room id among them on the
  recordings list.
- The console lists of rooms, users and recordings keep their search, filters and order in the URL, and the room page its
  selected tab, so a reload or a shared link shows the same view.
- The console lists keep their rows, dimmed, while a search, a sort or a new page loads, and show placeholder rows when
  they have none yet, instead of replacing the list with a spinner, and the Embedded page shows its sections with
  placeholder rows instead of a loading screen.
- The console overview shows the rooms by status (open, in a meeting now and closed), the recordings by status
  (available for playback, in progress and failed) and the rooms that reach their auto-deletion date within 7 days, and
  refreshes every 30 seconds while its tab is visible or on Refresh; `getAnalytics` returns them as `openRooms`,
  `closedRooms`, `recordingsInProgress`, `failedRecordings`, `roomsExpiringSoon` and `nextExpiringRoom`.

### Fixed

#### Integration

- A room member token issued before its participant was demoted through
  [`participantRoleUpdate`][3.10-participant-role-update] or `participantUpdateRole` stayed valid until it expired,
  so they kept their moderator permissions. It is now rejected.
- A room member token held by a participant kicked through [`participantKick`][3.10-participant-kick] or the embedded
  command of the same name stayed valid for up to 2 hours, so they could reconnect with it. It is now rejected.
- `refreshRoomMemberToken` renewed room member tokens without the checks that invalidate them after a change of the
  room's roles or access, of the member's permissions or of the user's role, or the deletion of the member or the
  user. It now applies them, and the meeting renews a refused token with the
  credentials it joined with.
- The `memberId` of an identified guest, which every participant of a meeting can read as their identity, also
  worked as the `secret` of the guest's `accessUrl`, so anyone who saw it could get room member tokens as that guest.
  Guests added from this release get an `accessUrl` whose `secret` adds a random part to the `memberId`, and only
  that exact secret grants their access.
- A room member holding `roomShareAccessLinks` received every anonymous link of the room from
  [`getRoom`][3.10-get-room] and [`getRooms`][3.10-get-rooms], the moderator link included. Each link is now returned
  only to a caller that also holds every permission it grants.
- A request whose credentials could not be checked because MongoDB or Redis failed answered `401`. It now answers
  `500`.
- A request whose path held a percent escape that does not decode, such as `/api/v1/rooms/%ZZ`, answered `500`. It
  now answers `400`.
- Kicking a participant answered `404` when the media server stopped answering during the kick. It now answers `503`.
- A list request with a `maxItems` below 1, such as `0.5`, answered an empty page marked as truncated and without a
  `nextPageToken`. Such a value now returns one item.
- The pages after the first of [`getRooms`][3.9-get-rooms] and [`getRecordings`][3.9-get-recordings] requested by a
  `room_manager` or `room_member` user listed rooms and recordings outside that user's scope, and those of
  [`getUsers`][3.9-get-users] with both `userId` and `name` ignored both filters. Every page now keeps the scope and the
  filters of the first.
- When `fields` left out the field the list is sorted by, the second page of `getRooms`, `getRecordings` and
  [`getRoomMembers`][3.9-get-room-members] was empty. It now continues the listing.
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
- A recording encoding the media server cannot use, such as an odd width, was accepted in a room's
  `recording.encoding` and in the `config.encoding` of [`startRecording`][3.9-start-recording], and the start then
  failed with a server error. Both now answer `422`.
- [`stopRecording`][3.9-stop-recording] answered `404` for a recording that had ended more than 24 hours earlier, and
  `500` for one that ended while the stop was being processed. It now answers `409` for both, as for any recording
  already stopped.
- [`bulkDeleteRecordings`][3.9-bulk-delete-recordings] and [`downloadRecordings`][3.9-download-recordings] accepted any
  number of `recordingIds`, and a long list failed with a server or proxy error. They now accept up to 100 distinct ids
  and answer `422` to more, and the recording lists disable ZIP download and bulk delete beyond 100 selected
  recordings.
- A recording whose egress service died stayed in progress for good: stopping it answered 500 and starting another one
  in the room 409. It ends as `failed`, with its [`recordingEnded`][3.10-recording-ended] webhook, and the room can
  record again.
- [`downloadRecordings`][3.9-download-recordings] with more than 50 recordings, two large ZIPs at once or a cancelled
  ZIP left every later recording playback and download on that server hanging until it restarted. Each ZIP now
  releases what it opened, whatever its size or however it ends.
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
- [`deleteRoom`][3.9-delete-room], [`bulkDeleteRooms`][3.9-bulk-delete-rooms] and the automatic deletion of expired
  rooms could leave a room `open` with a pending deletion when its meeting ended at the same moment, and the next
  meeting then deleted the room and its recordings; a meeting starting at the same moment could have its room deleted
  under it. A deletion now acts on the meeting state the room has when it is written.
- `getRoomMember` answered `404` for a member that does not exist before checking the caller, so a caller without
  access could tell which `memberId` values belong to the room. Such a caller now gets `403` whether or not the member
  exists.
- A room member token of one room got `404` for a room that does not exist and `403` for one that does on `getRoom`,
  `getRoomConfig`, `getRoomMember` and the meeting and broadcast operations, so it could tell which rooms exist. It
  now gets `403` for both.
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
- Inside `<openvidu-meet>`, `F11` pressed anywhere on the host page was taken by the meeting, and the browser did not
  toggle its own fullscreen. The meeting now takes it only with the focus inside the element.
- The styles of `<openvidu-meet>` reached the host page, restyling its own elements such as Angular Material
  components, and the host page's `<style>` rules reached inside the element. Each side's styles now stay on its side
  of the element's shadow root.
- On the device setup screen, the toolbar of `<openvidu-meet>` covered the top of the host page across its full width
  and took its clicks. It now stays inside the element.
- Meet in an iframe did not post `embeddedCloseRequested` to the host page from a recording screen or from an access
  error screen shown before the join screen, and dropped commands posted before the join screen without a console
  warning. It now listens to the host page and posts events from the moment it loads.
- With `leave-redirect-url` set, the redirect could replace the host page before `embeddedCloseRequested` reached it,
  in the embedded element and in the iframe. The redirect now follows the event.
- A `leave-redirect-url` stayed in effect for the next element or iframe of the same page, which then sent the host
  page to the earlier URL on Back. Each entry now uses only its own.
- Replacing an `<openvidu-meet>` element with a new one on another room could end on an error dialog instead of
  the new room's join screen. The new element now enters its room undisturbed.
- A room URL opened in an iframe or a direct link with `show-only-recordings` and no value, or a value other than
  `true` such as `1`, showed the meeting. It now shows the room recordings page unless the value is `false`, as the
  attribute of `<openvidu-meet>` does.
- Moving `<openvidu-meet>` to another container dropped the callbacks registered with `on()` and `once()`. They are
  now kept.

#### UI

- The Duration and Size headers of the console recordings list were shown in English whatever the language. They are now
  translated.
- After leaving a meeting that was being recorded, joining another meeting with the same `<openvidu-meet>`
  element showed that recording as still in progress. The recording indicator starts over with each meeting.
- A participant able to chat could publish a message imitating the server's, to show a recording as started or stopped,
  turn off other participants' devices or force a permission refresh, when the other meetings did not list them yet.
  Only messages the server sent take effect now.
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
- In a narrow desktop browser window or a narrow `<openvidu-meet>`, the meeting toolbar overflowed and hid some of its
  buttons. A window or an element too narrow for the whole toolbar now gets the compact toolbar a phone gets.
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
- The notices of the console room detail page about copying a member's link, removing members, deleting the room and
  failing to load members or recordings were always in English, as were the notice and the error dialog of deleting a
  room on the Rooms page. They now follow the selected language.
- The recording lists of the console and the room recordings page offered play and share on every recording, even to a
  user or room member without `recordingPlay`, and those actions then failed. They are now disabled, with a tooltip,
  without `recordingPlay`.
- The console treated the earliest registered user as the root admin, so after a change of
  `MEET_INITIAL_ADMIN_USER` it protected the wrong account. It now protects the `MEET_INITIAL_ADMIN_USER` account.
- In a room whose anonymous speaker access is disabled, the meeting still offered the anonymous speaker link to share,
  a link every recipient was refused with. The meeting no longer offers it.
- The console overview showed the getting-started view of an empty deployment when its request failed. It now keeps its
  last figures, or shows an error notice when it has none.
- The console pages scrolled inside their own column, with the scrollbar in the middle of the screen, and the bottom of
  the page, the **Load more** button of a list included, was cut off. The whole page scrolls now, with the scrollbar at
  the window edge.

#### Deployment

- A `SERVER_TRUST_PROXY` subnet in IPv4-mapped IPv6 notation with a short prefix, such as `::ffff:10.0.0.0/8`,
  trusted every client as a proxy, so rate limiting took the client address from `X-Forwarded-For`. Such a
  subnet now matches no IPv4 address.
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
- A `MEET_BASE_URL` whose port starts with `80` or `443`, such as `http://example.com:8080`, lost part of its port in
  every URL Meet returned. Only the default port of its scheme is now removed.
- A `MEET_BASE_PATH` that begins another path segment, such as `/r` before `/room`, cut that segment short in the
  access URLs of rooms. Only a whole leading segment is now removed.

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
[3.10-participant-kick]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/participantKick
[3.10-participant-role-changed]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/webhooks/participantRoleChangedWebhook
[3.10-participant-role-update]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/participantRoleUpdate
[3.10-update-room-status]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/updateRoomStatus
[3.10-get-room]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/getRoom
[3.10-get-rooms]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/getRooms
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
[3.9-delete-room]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/deleteRoom
[3.9-bulk-delete-rooms]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/bulkDeleteRooms
[3.9-get-rooms]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/getRooms
[3.9-get-recordings]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/getRecordings
[3.9-get-users]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/getUsers
[3.9-get-room-members]: https://openvidu.io/3.9/meet/embedded/reference/api.html#/operations/getRoomMembers

[3.10-recording-ended]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/webhooks/recordingEndedWebhook
[3.10-broadcasts]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/broadcastStart
[3.10-permissions]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/schemas/MeetPermissions
[3.10-room-config]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/schemas/MeetRoomConfig
[3.10-meetings]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/operations/meetingGet
[3.10-broadcast-started]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/webhooks/broadcastStartedWebhook
[3.10-broadcast-updated]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/webhooks/broadcastUpdatedWebhook
[3.10-broadcast-ended]: https://openvidu.io/3.10/meet/embedded/reference/api.html#/webhooks/broadcastEndedWebhook
