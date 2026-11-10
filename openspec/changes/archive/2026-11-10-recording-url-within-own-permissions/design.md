# Design

## Context

Paths are under `meet-ce/` unless stated.

- Each recording document stores `accessSecrets: { public, private }` (`backend/src/models/mongoose-schemas/recording.schema.ts`), created with `secureUid(10)` in `RecordingRepository` and stripped from every response (`MEET_RECORDING_DOCUMENT_ONLY_FIELDS`). `RecordingService.getRecordingAccessSecrets` reads them; `RecordingService.generateRecordingUrl` builds the link from one of them.
- `getRecordingUrl` runs `authorizeRecordingAccess('recordingPlay')` (`backend/src/middlewares/recording.middleware.ts`), which checks the caller's permissions through `RecordingService.validateRecordingAccess` without keeping them for the controller.
- For `getRecording`, `getRecordingMedia` and `downloadRecording`, `setupRecordingAuthentication` matches the `recordingSecret` against the two secrets: the public one replaces the credentials with anonymous access (after checking `access.anonymous.recording.enabled`), the private one keeps the usual credentials. `authorizeRecordingAccess(permission, true)` then lets any recognised secret through for `recordingPlay` and `recordingDownload` alike.
- Without credentials, `RoomAccessService.getAuthenticatedRoomMemberPermissions` returns `allPermissions()` (it treats the call as a system process). So after a public secret replaced the credentials, falling through to the permission check would grant everything: a play-only secret must be refused explicitly on download, never left to the permission check.
- `RecordingEntryService.validate` (`frontend/projects/shared-meet-components/src/lib/domains/recordings/services/recording-entry.service.ts`), run by the SPA route guard and the webcomponent route guard alike, loads the visitor's room permissions and, when the visit brings a secret, checks it with `getRecording`.
- The recording view page (`.../recordings/pages/view-recording/`) offers download to any visitor with a secret or with `recordingDownload` (`canDownloadRecording`) and sends the secret, when there is one, with the download request.
- The recording player (`.../recordings/components/recording-video-player/`), used by the console recording detail page and the recording view page, plays the `getRecordingMedia` URL in a `<video controls controlsList="nodownload">`. Its context menu is the browser's.
- Recording migrations live in `backend/src/migrations/recording-migrations.ts`; the collection is at `RECORDING_SCHEMA_VERSION` 3.

## Goals / Non-Goals

**Goals:**
- `getRecordingUrl` never returns a link that grants a permission its caller lacks.
- Every member allowed to play can still share.
- Every link shared before keeps granting what it granted.
- The app offers download only through its own action, gated by what the viewer holds.

**Non-Goals:**
- Changing what the current public and private secrets grant.
- Revoking or expiring links.
- Gating recording links with `roomShareAccessLinks`, a separate product question.
- Preventing a viewer from capturing what they can play.

## Decisions

### D1. Two more stored secrets, not a signed link

Each recording stores four secrets: `public` and `private` (play and download, as today) and `publicPlay` and `privatePlay` (play only). A secret is still an exact match against the recording's document, so the existing checks, the anonymous-access switch and the private-link login flow apply unchanged.
- Alternative: a link carrying a token signed by the server with what it grants. No storage and no migration, and expiry would come for free, but it is a second access mechanism next to the secrets, with its own key handling and longer URLs. Rejected for a fix.
- Alternative: one play-only secret with the scope decided elsewhere. Rejected: the public and private scopes differ in how the secret authenticates, so each scope needs its own.

### D2. The secret is refused where it is recognised

`RecordingService.getRecordingSecretGrant` tells which scope (public or private) a secret belongs to and whether it downloads, and throws the invalid-secret error for an unrecognised one. `setupRecordingAuthentication` takes the permission its route serves (`recordingPlay` for `getRecording` and `getRecordingMedia`, `recordingDownload` for `downloadRecording`). When the secret does not download and the route serves `recordingDownload`, it answers `403` with the insufficient-permissions error before any credential handling, so the request never reaches the permission check (see Context). `authorizeRecordingAccess` does not change: every secret that gets past `setupRecordingAuthentication` grants what that route serves.

`generateRecordingUrl` reads the caller's permissions with `RoomAccessService.getAuthenticatedRoomMemberPermissions(roomId)` and picks the play-only secret of the requested scope when they lack `recordingDownload`. The read repeats the one `authorizeRecordingAccess` made: free for API keys, `admin` users and room member tokens, one room read for other users.

### D3. The view page asks the server what its secret grants

An internal read, `GET /internal-api/v1/recordings/{recordingId}/link?recordingSecret=...`, answers `{ download: boolean }` after the same secret checks as `getRecording` (`400`, `401`, `403` alike). `RecordingEntryService.validate` calls it instead of `getRecording` when the visit brings a secret, so opening a link costs no extra request, and keeps its answer in `linkGrantsDownload` for the page.

The page offers download from the secret alone when the visit brings one, and from `recordingDownload` otherwise. A visitor with both a play-only secret and their own `recordingDownload` is offered no download there: the download request carries the secret, which `downloadRecording` refuses, and a public secret replaces the visitor's credentials anyway. The console still offers them the download.
- Alternative: a prefix in play-only secrets that the page reads. Rejected: it ties the UI to the secret format.
- Alternative: a field in the public `getRecording` response. Rejected: it describes the request's credentials, not the recording, and would land in the public contract.

### D4. Migration

Recording migration v3 → v4 adds `publicPlay` and `privatePlay` (`secureUid(10)`) to every document, bumping `RECORDING_SCHEMA_VERSION` and its `MIGRATION_REV`. The transform runs per document, so each recording gets its own secrets. New recordings are created with the four secrets. The migration runs at startup under the migration lock, so with several replicas it runs once; all replicas run the same version, so no replica serves a document without the new secrets.

### D5. Several replicas

Secrets live in MongoDB and are matched per request, so any replica answers a link created by another one alike.

### D6. The player opens no context menu

The player's `<video>` cancels its `contextmenu` event for every viewer and keeps `controlsList="nodownload"`. The app's own download action, gated as in D3 and by `recordingDownload` in the console, is the only download it offers.

Separate play and download URLs do not make this unnecessary: "Save video as" (Chrome, Edge, Firefox) and "Download Video" (Safari) save the video element's own source, the `getRecordingMedia` URL with its credentials in the query, which has to keep answering so the video plays. `controlsList="nodownload"` only hides the download item of Chromium's native controls; Firefox and Safari ignore it and keep the context menu item. Cancelling `contextmenu` covers all of them, long press on mobile included.
- Alternative: cancel it only for a viewer without download. Rejected: a viewer with download has the app's action, and one rule is simpler than tying the player to the viewer's permissions.

## Risks / Trade-offs

- [A link created before this release by a member without `recordingDownload` keeps granting download] → Accepted: those links cannot be told apart from others, and revoking them would break every shared link. Only new links follow the creator's permissions.
- [A play-only viewer can still capture what they play, or copy the media URL from the developer tools] → As the OpenAPI of `downloadRecording` already says, the split controls what the product offers. The link and the player now offer only what the viewer may do.
- [Two more secrets per recording] → Two short strings per document, written once.
