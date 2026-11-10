# Design

## Context

Paths are under `meet-ce/` unless stated.

- Each recording document stores `accessSecrets: { public, private }` (`backend/src/models/mongoose-schemas/recording.schema.ts`), created with `secureUid(10)` in `RecordingRepository` and stripped from every response (`MEET_RECORDING_DOCUMENT_ONLY_FIELDS`). `RecordingService.getRecordingAccessSecrets` reads them; `RecordingService.generateRecordingUrl` builds the link from one of them.
- `getRecordingUrl` runs `authorizeRecordingAccess('recordingPlay')` (`backend/src/middlewares/recording.middleware.ts`).
- For `getRecording`, `getRecordingMedia` and `downloadRecording`, `setupRecordingAuthentication` matches the `recordingSecret` against the two secrets: the public one replaces the credentials with anonymous access (after checking `access.anonymous.recording.enabled`), the private one keeps the usual credentials. `authorizeRecordingAccess(permission, true)` then lets any recognised secret through for `recordingPlay` and `recordingDownload` alike.
- Without credentials, `RoomAccessService.getAuthenticatedRoomMemberPermissions` returns `allPermissions()` (it treats the call as a system process). So after a public secret replaced the credentials, falling through to the permission check would grant everything: a play-only secret must be refused explicitly on download, never left to the permission check.
- The recording view page (`frontend/projects/shared-meet-components/src/lib/domains/recordings/pages/view-recording/`) offers download to any visitor with a secret (`canDownloadRecording`), and its share dialog offers that visitor the same link.
- Recording migrations live in `backend/src/migrations/recording-migrations.ts`; the collection is at `RECORDING_SCHEMA_VERSION` 3.

## Goals / Non-Goals

**Goals:**
- `getRecordingUrl` never returns a link that grants a permission its caller lacks.
- Every member allowed to play can still share.
- Every link shared before keeps granting what it granted.

**Non-Goals:**
- Changing what the current public and private secrets grant.
- Revoking or expiring links.
- Gating recording links with `roomShareAccessLinks`, a separate product question.

## Decisions

### D1. Two more stored secrets, not a signed link

Each recording stores four secrets: `public` and `private` (play and download, as today) and `publicPlay` and `privatePlay` (play only). A secret is still an exact match against the recording's document, so the existing checks, the anonymous-access switch and the private-link login flow apply unchanged.
- Alternative: a link carrying a token signed by the server with what it grants. No storage and no migration, and expiry would come for free, but it is a second access mechanism next to the secrets, with its own key handling and longer URLs. Rejected for a fix.
- Alternative: one play-only secret with the scope decided elsewhere. Rejected: the public and private scopes differ in how the secret authenticates, so each scope needs its own.

### D2. What each secret grants is decided in one place

`setupRecordingAuthentication` resolves the secret to its scope (public or private) and to whether it grants download, and records both in `res.locals` for the request. `authorizeRecordingAccess(permission, true)` reads that record: `recordingPlay` is waived for any recognised secret, `recordingDownload` only for one that grants download; a play-only secret on `downloadRecording` answers `403` with the insufficient-permissions error, never falling through to the caller's permissions (see Context). `getRecordingUrl` picks the secret from the scope requested and from the caller's `recordingDownload`, read with the permissions `authorizeRecordingAccess` already loaded.

### D3. The view page asks the server what its secret grants

An internal read, `GET /internal-api/v1/recordings/{recordingId}/link?recordingSecret=...`, answers `{ download: boolean }` after the same secret checks as `getRecording` (`400`, `401`, `403` alike). The view page calls it once when it has a secret and offers download from the answer.
- Alternative: a prefix in play-only secrets that the page reads. Rejected: it ties the UI to the secret format, and an old link without the prefix would read as play-and-download by accident rather than by design.
- Alternative: a field in the public `getRecording` response. Rejected: it describes the request's credentials, not the recording, and would land in the public contract.

### D4. Migration

Recording migration v3 → v4 adds `publicPlay` and `privatePlay` (`secureUid(10)`) to every document, bumping `RECORDING_SCHEMA_VERSION` and its `MIGRATION_REV`. New recordings are created with the four secrets. The migration runs at startup under the migration lock, so with several replicas it runs once; all replicas run the same version, so no replica serves a document without the new secrets.

### D5. Several replicas

Secrets live in MongoDB and are matched per request; nothing is kept in memory or Redis. Any replica answers a link created by another one alike.

## Risks / Trade-offs

- [A link created before this release by a member without `recordingDownload` keeps granting download] → Accepted: those links cannot be told apart from others, and revoking them would break every shared link. Only new links follow the creator's permissions.
- [A play-only visitor can still capture what they play] → As the OpenAPI of `downloadRecording` already says, the split controls what the product offers. The link now offers only what its creator could.
- [Two more secrets per recording] → Two short strings per document, written once.
