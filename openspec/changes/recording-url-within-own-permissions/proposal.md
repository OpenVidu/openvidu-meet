# Proposal

## Why

`getRecordingUrl` requires only `recordingPlay`, but both links it returns let their holder play **and download** the recording: the public one to anyone, the private one to any logged-in OpenVidu Meet user. A room member allowed to play recordings but not to download them can therefore create a link that offers the download they were denied, and share it or open it themselves. It breaks the rule `share-links-within-own-permissions` set for the anonymous room links: a caller never receives a link that grants a permission it lacks.

The recording player has the same gap without any link: its video element keeps the browser's context menu, whose "Save video as" saves the file to any viewer, including one without `recordingDownload`.

## What Changes

- A recording link grants what its creator holds. Each recording gets, next to its current public and private secrets, a public and a private secret that grant play only.
- `getRecordingUrl` keeps requiring only `recordingPlay`. A caller holding `recordingDownload` gets the current link, which plays and downloads; a caller without it gets the play-only link of the scope it asked for. Sharing stays available to every member allowed to play.
- `downloadRecording` refuses a play-only secret with `403`. `getRecording` and `getRecordingMedia` accept it like the current secrets, with the same public and private rules.
- The recording view page offers download to a visitor who brings a secret only when that secret grants it, as the server tells it, and to any other visitor with `recordingDownload`.
- The recording player, in the console and on the recording view page, opens no context menu on the video and offers no download in its native controls. Download is offered only by the app's own action, gated as above.
- Links already shared keep working exactly as before, download included. Recordings that exist before this release get their play-only secrets on the first start.
- This is a security fix. A caller that used to obtain a link granting a permission it lacks now gets one granting only what it holds. Not marked **BREAKING**: nothing that works today stops working, and the only difference is what a newly created link grants to a caller without `recordingDownload`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `recordings`: "Shareable recording links" (the link grants download only to a caller holding `recordingDownload`), "Access with a recording secret" and "Downloading a recording" (play-only secrets do not download), "Recording view page" (download offered by what the visit grants) and a new "Recording player offers no download of its own".

## Impact

- REST API: `getRecordingUrl` keeps its request and response shape; the secret in the link it returns may be a play-only one. `downloadRecording` answers `403` to a play-only secret. No field, parameter or status code is added. The OpenAPI descriptions of `getRecordingUrl`, `downloadRecording` and the `recordingSecret` parameter say which secrets download.
- Internal API: one read that tells the recording view page whether its secret grants download. No compatibility promise.
- Webhooks, embedded API, deployment configuration: not affected. The embedded `recording-url` attribute takes a link the host obtained, usually with an API key, which keeps getting play-and-download links.
- Storage: each recording document gains two secrets, through a recording schema migration.
- Console and recording view page: the recording player opens no context menu on the video. Recording view page: the download action follows what the visit grants. Meeting UI: none.
- `CHANGELOG.md`: one line under 3.10.0, `Fixed`, `Integration`.
- openvidu.io: `docs/meet/features/recordings/management.md` ("Sharing recordings") says that a link created without the download permission plays the recording but does not download it, and the REST API reference is regenerated.
