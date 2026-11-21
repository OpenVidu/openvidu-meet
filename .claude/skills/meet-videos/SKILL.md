---
name: meet-videos
description: Record cursor-guided demo videos of the OpenVidu Meet frontend (the Angular app served at /meet) for openvidu.io, its docs pages and its landing. Use when the user asks to record, capture, or generate demo videos / screen recordings / animated clips of the app — a live meeting, creating a room, joining a meeting, an admin/console tour, etc. Drives the running app with Playwright, injects a synthetic on-screen cursor that glides between elements and flashes a click ripple (the whole point — Playwright video does NOT capture the real pointer), logs in once and reuses the session, forces light/dark theme, seeds demo data via the REST API, and writes an MP4 per flow + theme, named and placed like the openvidu.io asset it replaces (WebM/GIF/animated-WebP also supported). To refresh the openvidu.io assets for a release, start from the meet-docs-sync skill. Sibling of the meet-screenshots skill and reuses its login/seeding/live-participant machinery.
---

# OpenVidu Meet — cursor-guided demo videos

Record short, animated walkthroughs of the Meet frontend for openvidu.io. Each
**flow** is a scripted, cursor-driven tour (not a single still): the cursor glides between UI
elements, clicks with a visible ripple, and types with a natural cadence. The bundled `record.mjs`
does the work; this file is the flow/selector reference and the place to add new flows.

## Standard resolution & format

**1920×1080 (Full HD), `deviceScaleFactor: 1`, MP4 (H.264), 30 fps** — the default. MP4 plays
inline in every browser via `<video autoplay muted loop playsinline>`, which is what a landing hero
wants. Pass `--format webm|gif|webp` for other targets, `--scale 2` for HiDPI (heavy — 4K video).

## Prerequisites

- A running backend. For openvidu.io assets use an empty, isolated stack started from the main checkout
  (`./meet.sh stack up docs`) and run the script through `./meet.sh stack run docs -- node ...`: it reads the
  stack's `MEET_API_URL`. Without it the target is `http://localhost:6080/meet` (`--origin` to change it).
  Flows that seed rooms or users (`seed`) refuse a backend that already has rooms or users other than the
  admin, and empty it again when they end.
- **Playwright + Chromium** (already in the repo root `node_modules`). Run **from the repo root** so `import 'playwright'` resolves.
- **ffmpeg** on `PATH` — required. Playwright records WebM; ffmpeg transcodes to the chosen format and builds the per-participant fake-camera samples. Without it the tool cannot produce output.
- Admin credentials (default `admin`/`admin`).

## How to run

```bash
node .claude/skills/meet-videos/record.mjs                              # all flows, both themes -> MP4
node .claude/skills/meet-videos/record.mjs --list                       # flow ids and the file each writes
node .claude/skills/meet-videos/record.mjs --flows live-meeting --themes dark
./meet.sh stack run docs -- node .claude/skills/meet-videos/record.mjs --flows delete-room,create-user --out ../openvidu.io/docs/assets
```

To bring openvidu.io up to date, start from the `meet-docs-sync` skill: it lists which assets are stale
and prints these commands.

Flags: `--flows` (csv), `--themes` (`light,dark`), `--width`/`--height`/`--scale`, `--timeout`
(ms, default 30000), `--pace` (motion/pause speed multiplier, >1 slower), `--out`, `--origin`,
`--base` (`/meet`), `--user`/`--password`, `--no-cleanup`, `--headed`, `--list`,
`--format` (`mp4` default | `webm` | `gif` | `webp`), `--fps` (default 30),
`--crf` (mp4/webm quality, default 21; lower = better/larger), `--quality` (gif/webp, default 80),
`--gif-width` (downscale width for gif/webp, default 1000 — full-res gif is huge). Fake-camera
**video** assets: `--asset-width` (default 960), `--asset-fps` (12), `--asset-seconds` (max looped
length, 8) — these bound the raw Y4M decoded from a video asset (see below).

## The synthetic cursor (why this skill exists)

Playwright video capture records the page's compositor output, which does **not** include the OS
pointer — a recording of clicks with no visible cursor is useless for a demo. So `installCursor()`
is injected via `context.addInitScript` and:

- draws an arrow cursor (`#__ov_demo_cursor__`, `pointer-events:none`) that tracks real `mousemove`
  events, and flashes a **ripple** on `mousedown`;
- renders in the browser **top layer** via the Popover API (`popover="manual"` + `showPopover()`),
  and a `MutationObserver` **re-promotes** it whenever a CDK overlay opens (see gotcha below);
- survives Angular SPA navigation (the `<body>` persists) and is re-installed on full page loads.

> **Gotcha — the cursor must be in the TOP LAYER, not just high z-index.** Angular Material
> dialogs, menus and `mat-select` panels render in the browser **top layer**, which paints above
> *all* z-index content — so a `z-index:2147483647` cursor is still hidden behind them (invisible
> exactly when you click a modal/menu/option). The fix: the cursor and the click ripple are
> `popover="manual"` elements shown with `showPopover()` (top layer). Because the top-layer stack is
> ordered by promotion time, a `MutationObserver` watching for added `.cdk-overlay-pane` /
> `mat-dialog-container` / `.mat-mdc-menu-panel` / `.mat-mdc-select-panel` / `dialog` nodes
> re-promotes the cursor (`hidePopover()`+`showPopover()`) so it stays on top of the just-opened
> overlay. z-index is kept as a fallback for engines without popover support.

`moveCursor()` drives it with **eased** (`easeInOutQuad`), distance-scaled motion — many small
`page.mouse.move` steps so the injected cursor follows smoothly. `clickSelector()` glides to an
element's centre then performs a real `locator.click` (so the click is reliable AND animated).
`typeText()` glides, focuses, clears any prefilled value, then types with a per-key delay.

> **Gotcha — `addInitScript` needs a real navigation.** It runs on `page.goto`/full loads, NOT on
> `page.setContent` (no navigation → cursor never installs). Every flow starts with `page.goto`.

> **Gotcha — empty Material fields need a force click.** An *empty* `mat-form-field` renders its
> floating label over the input's centre, so a normal click hit-tests the label (a non-descendant)
> and never lands. `typeText()` uses `locator.click({ force: true })` — it still fires the real
> mouse events the cursor animates while reliably focusing the input.

## Video recording & transcode

Contexts are created with `recordVideo: { dir, size }`; Playwright finalizes the WebM on
`context.close()`, then `video.path()` gives the file and ffmpeg transcodes it:

- **mp4** (default): `libx264 -pix_fmt yuv420p -movflags +faststart` + even dimensions → plays inline everywhere.
- **webm**: `libvpx-vp9`. **gif**: `palettegen`/`paletteuse` (downscaled). **webp**: `libwebp_anim -loop 0`.

Live flows put `recordVideo` + the cursor only on the **filmed** participant; background
participants run plain. `--pace` scales the timing globally if a clip feels too fast/slow.

**Split flows** (`kind:'lifecycle'`) record one continuous take, but the driver calls `mark(name)`
at each phase boundary to stamp the elapsed time; after the take, `splitSegments()` re-encodes the
recording into one clip per segment (accurate output-seeking with ffmpeg `-ss`/`-t`). The
room-lifecycle flow also needs a logged-in session AND its own camera, so it runs in a
fake-camera browser with the reused `storageState` applied (`newParticipant({ authed: true })`).

## Focus effect: zoom and soft blur on what matters

A flow can make its important clicks stand out. `clickSelector(page, sel, { zoom: true })` logs the
click (when the cursor starts gliding, when it clicks, and the target's box); `focusOn: '<selector>'`
swaps in a larger region to keep sharp, such as the whole menu a menu item belongs to. After the take,
`renderFocusVideo()` re-encodes it with ffmpeg and applies **focus spans**: for each one, a smoothstep
ramp eases a zoom (`zoom`, default `FOCUS_ZOOM`) onto its `box` while a blurred copy of the frame
(`FOCUS_BLUR`) fades in everywhere except a feathered window on that box. Zoom and blur share the
ramp, so they move together. Spans run one after another and must not overlap; between two of them
the zoom is back at 1, so the centre switches unseen. The logged clicks become one span.

Time is the wall clock of the filmed page (`videoT0`, stamped just before `newPage()`), which is what
Playwright's WebM counts from. `startVideoHere()` trims the clip to begin inside the meeting rather
than on the lobby. Only mp4 gets the effect; flows that log no clicks are encoded as before. Tuning
lives in the `FOCUS_*` constants.

**Refocus a clip that is already recorded** (no new take): pass explicit spans, in seconds into the
clip and in frame pixels, to add zooms the flow did not log, for instance onto a panel or a toast that
appears after the clicks. The result is written to `--out` under the same name.

```bash
node .claude/skills/meet-videos/record.mjs --refocus clip.mp4 --crf 18 --spans \
  '[{"start":8.3,"end":10.9,"zoom":1.8,"box":{"x":1556,"y":70,"width":344,"height":300}},
    {"start":11.1,"end":13.4,"zoom":2.0,"box":{"x":16,"y":8,"width":360,"height":120}}]'
```

Each pass re-encodes the clip, so use a low `--crf` (18) to keep the first pass's quality. Measure a
`box` on a full-resolution frame (`ffmpeg -ss <t> -i clip.mp4 -frames:v 1 frame.png`), and read the
start and end times off a contact sheet (`fps=2,tile=4x4`).

## Live flows & the sample webcam (shared with meet-screenshots)

The meeting flows drive a real multi-participant meeting. **Each participant runs in its own
browser** (one `chromium.launch` per person), because a single browser can only feed one fake-camera
file to all its tabs. Each is launched with `--use-fake-device-for-media-stream` +
`--use-fake-ui-for-media-stream` and a per-person `--use-file-for-fake-video-capture` pointing at a
Y4M transcoded from that person's asset (`assets/`, cached per file). So every tile shows a
**different** real person. Faces/names come from `SAMPLE_ROSTER` in `record.mjs`; the first entry is
the filmed viewer, the rest are background participants who join first. If ffmpeg or the asset is
missing, that participant falls back to the green test pattern.

### Image vs. video assets (real movement)

Each roster asset can be a **static image** (`.jpg`/`.png`) or a **video** (`.mp4`/`.webm`/`.mov`).
A video looks far more realistic — the tile shows a moving person instead of a frozen frame.
`resolveAsset()` picks the best asset **by basename, preferring video over image**: drop
`guy-sample01.mp4` next to `guy-sample01.jpg` and it's used automatically; delete/omit the video and
it falls back to the image. So the roster filenames don't need to change to adopt video.

`sampleY4mFor()` decodes a video frame-by-frame into a Y4M that **Chromium loops** at its end (so the
motion repeats seamlessly), capped by `--asset-width`/`--asset-fps`/`--asset-seconds` — Y4M is raw
and uncompressed, so a full-res multi-second clip is large; the defaults (960px, 12 fps, ≤8 s) keep
each sample ~tens of MB in `$TMPDIR`. A static image still loops a 1 s still as before.

**Recommended assets:** short (5–10 s), loosely-looping talking-head clips at a 4:3/16:9 framing,
one per roster name. If you only have portraits, `ffmpeg` can fake gentle motion with a Ken-Burns
zoom (`-loop 1 -i face.jpg -t 6 -vf "zoompan=z='min(zoom+0.0015,1.25)':d=1:s=1280x720:fps=25"`),
though real footage reads best.

Live flows seed their own room per theme and delete it afterwards. Multi-browser joins are
timing-sensitive, so each live flow retries once per theme automatically; if one still fails, re-run
just that theme (`--themes dark`).

## Output naming

`<out>/<flow.out>/<flow.id>-<theme>.<ext>` (split flows append the segment: `<flow.id>-<segment>-<theme>`).
openvidu.io flows use the asset folder under `docs/assets` as `out` and the asset name as `id`
(`videos/meet/rooms/management/delete-room-light.mp4`), so `--out <openvidu.io>/docs/assets` overwrites the
published clip. Demo clips no page uses write under `extra/`. A flow's own `pace` multiplies `--pace`
(the console clips use 0.6). UI flows start the clip once the first page has loaded (`startVideoHere`).
A failed take prints the failing line of `record.mjs` and the path of a screenshot taken at that moment.

## Flow catalog (built into record.mjs)

| Flow id | Kind | Writes (under `--out`) | What the cursor does |
|---|---|---|---|
| `login` | ui (anon) | videos/meet/users/overview | Types the user id and password, clicks **Login**, lands on the Overview. |
| `create-room-basic` | ui, seeds 3 rooms | videos/meet/rooms/management | Rooms list → **Create Room** → types "Product Demo Room" → **Create Room**. |
| `create-room-wizard` | ui, seeds 3 rooms | videos/meet/rooms/management | **Create Room** → **Advanced setup** → name, 10 participants and 60 min in Meeting, **First participant joins** and **Speaker** in Recording, the Live broadcast step, Room Access → **Create Room**. |
| `delete-room` | ui, seeds "Old Project Room" | videos/meet/rooms/management | Row menu → **Delete room** → confirms. |
| `update-room-status` | ui, seeds "Product Demo" | videos/meet/rooms/management | Row menu → **Close room**. |
| `share-link` | ui, seeds "Product Demo" | videos/meet/rooms/access | Row menu → **Share link** → **Anonymous Moderator** → **Get Link** → copy. |
| `create-user` | ui | videos/meet/users/management | **Create User** → olivia_brooks, Olivia Brooks, Room Member, a password → **Create User**. |
| `delete-user` | ui, seeds Ava Morgan | videos/meet/users/management | Delete button → confirms. |
| `reset-user-password` | ui, seeds Noah Bennett | videos/meet/users/management | Reset button → **Auto generate** → **Reset Password**. |
| `update-user-role` | ui, seeds Liam Walker | videos/meet/users/management | Role button → **Room Manager** → **Save Role**. |
| `join-meeting` | live (3 ppl) | videos/meet/getting-started | Two participants already in; the filmed one types a name, sees the device view, **Join**. |
| `access-room` | live (2 ppl), filmed as the admin | videos/meet/meetings/overview | Rooms list (David already in the meeting) → access button → join view → device view → **Join**. |
| `enable-captions` | live (2 ppl) | videos/meet/meetings/live-captions | Moderator turns captions on; the other participant's words stream in. Captions are stubbed and injected through `window.ng`, so the backend must serve the **development** build. |
| `start-recording` | live (2 ppl) | videos/meet/recordings/management | Starts inside the meeting; **More options** → **Start recording** with the zoom and blur focus; the Activities panel goes from starting to active. |
| `live-meeting` | live (4 ppl) | extra/meeting | Mic and camera off/on, chat message, participants panel. |
| `console-tour` | ui, seeds 3 rooms | extra/console | Clicks through Rooms, Recordings, Users, Configuration and back. |
| `room-lifecycle` | lifecycle | extra/meeting | One authed take split into create / join / record clips; needs an empty room list. |

## Key selectors (verified against the frontend source)

- **Console side-nav:** `#nav-link-overview` · `#nav-link-rooms` · `#nav-link-recordings` · `#nav-link-users` · `#nav-link-config` · `#nav-link-embedded` (id is `nav-link-<route>`).
- **Rooms list / wizard:** `#create-room-btn` (list) → `/rooms/new` opens in basic mode → `.room-basic-creation-form input` (name, prefilled "Room") + `#create-room-button` (submit). Advanced wizard nav: `#wizard-next-btn` · `#wizard-finish-btn`; five steps (Room Details, Meeting, Recording, Live broadcast, Room Access).
- **Row actions:** rooms `[id^="access-room-btn-"]` (opens a new tab: `access-room` replaces `window.open` to stay in one recorded page), `[id^="more-actions-btn-"]` → `share-link-btn-` / `toggle-room-status-btn-` / `delete-room-btn-`; users `update-role-btn-` / `reset-password-btn-` / `delete-user-btn-`. Dialogs: `.mat-mdc-dialog-container`, confirm `.confirm-button`, share dialog `.generate-button` / `.copy-button`.
- **Lobby / prejoin:** `#participant-name-input` · `#participant-name-submit` · `#join-button` · `#layout-container` · `#media-buttons-container`.
- **In-meeting toolbar:** `#mic-btn` · `#camera-btn` · `#screenshare-btn` · `#chat-panel-btn` · `#participants-panel-btn` · `#more-options-btn` · `#grid-layout-settings-btn` · `#leave-btn`. Chat: `#chat-input` · `#send-btn`. Remote tiles: `.OV_stream_video.remote`; participants panel: `ov-participants-panel`.

## REST API reference (for seeding)

Same API as meet-screenshots. Login (seeding): `POST /internal-api/v1/auth/login {userId,password}`
→ `accessToken`. Rooms: `POST /api/v1/rooms {roomName}` → `{roomId, access.anonymous.moderator.url, …}`;
`GET /api/v1/rooms?maxItems=100` → `{rooms:[…]}`; `DELETE /api/v1/rooms/:id?withMeeting=force&withRecordings=force`
(lowercase enums) deletes a demo room immediately. Anonymous meeting join uses
`room.access.anonymous.moderator.url` — no login required.

## Safety rules (important)

- **Seeded flows need an empty backend** and check it before anything runs; between takes and at the end they
  delete every room and every user but the admin. Use an isolated stack, never the shared :6080 backend.
- **Live flows** create and delete their own room per theme and touch nothing else.
- Cleanup issues backend `DELETE`s; in stricter permission modes those may prompt for approval.

## Extending coverage

Add an entry to `ALL_FLOWS` in `record.mjs`; for an openvidu.io clip, name it after the asset and set
`out` to its folder. For a **UI flow** (`kind:'ui'`), write an async `drive(page)` that starts with
`startOnList(page, route, marker)` (or `page.goto` + `startVideoHere()`) and uses
`clickSelector`/`typeText`/`moveCursor` + `page.waitForTimeout(P(ms))`; give it a `seed` when the clip
needs rooms or users. It runs in the shared logged-in browser with a fresh recording context per theme. For a **live flow** (`kind:'live'`, set `roomName` + `count`),
write `drive(page, url, roster)` — the runner seeds the room, joins `count-1` background
participants, then films participant `roster[0]`. Use the selector list above; pick stable ids and
wait on a loaded-state marker before acting. Keep pauses generous (`P(...)`) so the motion reads
clearly on the landing page, and use `--pace` to fine-tune without editing the script.
