---
name: meet-videos
description: Record cursor-guided demo videos of the OpenVidu Meet frontend (the Angular app served at /meet) for a product landing page. Use when the user asks to record, capture, or generate demo videos / screen recordings / animated clips of the app — a live meeting, creating a room, joining a meeting, an admin/console tour, etc. Drives the running app with Playwright, injects a synthetic on-screen cursor that glides between elements and flashes a click ripple (the whole point — Playwright video does NOT capture the real pointer), logs in once and reuses the session, forces light/dark theme, seeds demo data via the REST API, and writes an MP4 per flow + theme (WebM/GIF/animated-WebP also supported). Sibling of the meet-screenshots skill and reuses its login/seeding/live-participant machinery.
---

# OpenVidu Meet — cursor-guided demo videos

Record short, animated walkthroughs of the Meet frontend for a marketing landing page. Each
**flow** is a scripted, cursor-driven tour (not a single still): the cursor glides between UI
elements, clicks with a visible ripple, and types with a natural cadence. The bundled `record.mjs`
does the work; this file is the flow/selector reference and the place to add new flows.

## Standard resolution & format

**1920×1080 (Full HD), `deviceScaleFactor: 1`, MP4 (H.264), 30 fps** — the default. MP4 plays
inline in every browser via `<video autoplay muted loop playsinline>`, which is what a landing hero
wants. Pass `--format webm|gif|webp` for other targets, `--scale 2` for HiDPI (heavy — 4K video).

## Prerequisites

- App **running** at `http://localhost:6080/meet` (verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:6080/meet` → `301`).
- **Playwright + Chromium** (already in the repo root `node_modules`). Run **from the repo root** so `import 'playwright'` resolves.
- **ffmpeg** on `PATH` — required. Playwright records WebM; ffmpeg transcodes to the chosen format and builds the per-participant fake-camera samples. Without it the tool cannot produce output.
- Admin credentials (default `admin`/`admin`).

## How to run

```bash
node .claude/skills/meet-videos/record.mjs                              # all flows, both themes -> MP4
node .claude/skills/meet-videos/record.mjs --list                       # list flow ids and exit
node .claude/skills/meet-videos/record.mjs --flows live-meeting --themes dark
node .claude/skills/meet-videos/record.mjs --flows create-room,console-tour --pace 1.3
```

Flags: `--flows` (csv), `--themes` (`light,dark`), `--width`/`--height`/`--scale`, `--timeout`
(ms, default 30000), `--pace` (motion/pause speed multiplier, >1 slower), `--out`, `--origin`,
`--base` (`/meet`), `--user`/`--password`, `--no-cleanup`, `--headed`, `--list`,
`--format` (`mp4` default | `webm` | `gif` | `webp`), `--fps` (default 30),
`--crf` (mp4/webm quality, default 23; lower = better/larger), `--quality` (gif/webp, default 80),
`--gif-width` (downscale width for gif/webp, default 1000 — full-res gif is huge). Fake-camera
**video** assets: `--asset-width` (default 960), `--asset-fps` (12), `--asset-seconds` (max looped
length, 8) — these bound the raw Y4M decoded from a video asset (see below).

## The synthetic cursor (why this skill exists)

Playwright video capture records the page's compositor output, which does **not** include the OS
pointer — a recording of clicks with no visible cursor is useless for a demo. So `installCursor()`
is injected via `context.addInitScript` and:

- draws an arrow cursor (`#__ov_demo_cursor__`, `pointer-events:none`, max z-index) that tracks
  real `mousemove` events, and flashes a **ripple** on `mousedown`;
- survives Angular SPA navigation (the `<body>` persists) and is re-installed on full page loads.

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

## Output naming — by domain + flow

`<out>/<domain>/<flow-id>-<theme>.<ext>` (folder = frontend domain, file = flow + theme; `<ext>`
follows `--format`). Default `--out` is `./videos`. A default run produces **10 MP4s** (5 flows × 2 themes):

```
auth/      login-{light,dark}
meeting/   live-meeting-{light,dark} · join-meeting-{light,dark}
rooms/     create-room-{light,dark}
console/   console-tour-{light,dark}
```

## Flow catalog (built into record.mjs)

| Flow id | Kind | Domain | What the cursor does |
|---|---|---|---|
| `login` | ui (anon) | auth | Starts logged out on `/login`: cursor types the user id → types the password → clicks **Login** → lands on the Overview console. Skips reused-session + seeding. |
| `live-meeting` | live (4 ppl) | meeting | Filmed viewer joins a seeded room with 3 others → toggles mic off/on → toggles camera off/on → opens Chat, types & sends a message → opens the Participants panel → closes it, ending on the grid. The hero clip. |
| `join-meeting` | live (3 ppl) | meeting | Two participants already in the room; the filmed viewer walks the lobby: types a display name → clicks the name submit → device-preview prejoin → clicks **Join** → lands in the populated room. |
| `create-room` | ui (admin) | rooms | Rooms list → clicks **Create Room** → basic wizard → clears the default "Room" and types "Product Demo Room" → clicks **Create Room**. |
| `console-tour` | ui (admin) | console | Overview → clicks each side-nav item (Rooms → Recordings → Users → Configuration) → back to Overview, lingering on each screen. Uses 3 seeded demo rooms so lists are populated. |

## Key selectors (verified against the frontend source)

- **Console side-nav:** `#nav-link-overview` · `#nav-link-rooms` · `#nav-link-recordings` · `#nav-link-users` · `#nav-link-config` · `#nav-link-embedded` (id is `nav-link-<route>`).
- **Rooms list / wizard:** `#create-room-btn` (list) → `/rooms/new` opens in basic mode → `.room-basic-creation-form input` (name, prefilled "Room") + `#create-room-button` (submit). Advanced wizard nav: `#wizard-next-btn` · `#wizard-finish-btn`.
- **Lobby / prejoin:** `#participant-name-input` · `#participant-name-submit` · `#join-button` · `#layout-container` · `#media-buttons-container`.
- **In-meeting toolbar:** `#mic-btn` · `#camera-btn` · `#screenshare-btn` · `#chat-panel-btn` · `#participants-panel-btn` · `#more-options-btn` · `#grid-layout-settings-btn` · `#leave-btn`. Chat: `#chat-input` · `#send-btn`. Remote tiles: `.OV_stream_video.remote`; participants panel: `ov-participants-panel`.

## REST API reference (for seeding)

Same API as meet-screenshots. Login (seeding): `POST /internal-api/v1/auth/login {userId,password}`
→ `accessToken`. Rooms: `POST /api/v1/rooms {roomName}` → `{roomId, access.anonymous.moderator.url, …}`;
`GET /api/v1/rooms?maxItems=100` → `{rooms:[…]}`; `DELETE /api/v1/rooms/:id?withMeeting=force&withRecordings=force`
(lowercase enums) deletes a demo room immediately. Anonymous meeting join uses
`room.access.anonymous.moderator.url` — no login required.

## Safety rules (important)

- **Never deletes pre-existing rooms.** It snapshots room ids at startup, seeds its own demo rooms
  for the UI flows, and the `create-room` flow makes one room through the UI. Cleanup removes ONLY
  rooms that appeared during the run and weren't pre-existing (tracked by id) — pre-existing rooms
  are always left alone. `--no-cleanup` keeps everything.
- Live flows create + delete their own room per theme (self-cleaning), so they don't collide with
  seeded data.
- Cleanup issues backend `DELETE`s; in stricter permission modes those may prompt for approval. If
  blocked/failed, the script reports what remains.

## Extending coverage

Add an entry to `ALL_FLOWS` in `record.mjs`. For a **UI flow** (`kind:'ui'`), write an async
`drive(page)` that `page.goto`s the start route and uses `clickSelector`/`typeText`/`moveCursor` +
`page.waitForTimeout(P(ms))` to script the tour; it runs in the shared logged-in browser with a
fresh recording context per theme. For a **live flow** (`kind:'live'`, set `roomName` + `count`),
write `drive(page, url, roster)` — the runner seeds the room, joins `count-1` background
participants, then films participant `roster[0]`. Use the selector list above; pick stable ids and
wait on a loaded-state marker before acting. Keep pauses generous (`P(...)`) so the motion reads
clearly on the landing page, and use `--pace` to fine-tune without editing the script.
