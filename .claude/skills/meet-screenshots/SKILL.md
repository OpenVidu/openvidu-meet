---
name: meet-screenshots
description: Capture documentation screenshots of the OpenVidu Meet frontend (the Angular app served at /meet) across every screen and both themes. Use when the user asks to screenshot, capture, or generate images of app screens — overview, rooms, recordings, users, login, wizard, etc. — for a docs/marketing website. Drives the running app with Playwright, logs in once and reuses the session, forces light/dark theme, seeds demo data via the REST API, and writes PNGs named by domain + navigation path. The UI route map (from each domain's *.routes.ts) and the REST API reference are documented below.
---

# OpenVidu Meet — screenshot capture

Take consistent, theme-aware screenshots of every Meet frontend screen for documentation.
The bundled `capture.mjs` does the work; this file is the route/API reference and the place to
extend coverage to new screens.

## Standard documentation resolution

**1920×1080 (Full HD), `deviceScaleFactor: 1`** — the default. Single most common screenshot
resolution; downscales cleanly into docs content columns. Pass `--scale 2` for HiDPI (→ 3840×2160).

## Prerequisites

- App **running** at `http://localhost:6080/meet` (verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:6080/meet` → `301`).
- **Playwright + Chromium** (already in the repo root `node_modules`). Run **from the repo root** so `import 'playwright'` resolves.
- **ffmpeg** on `PATH` — used to transcode WebP output (the default format) and the live-scene sample webcam. Without it, use `--format png`; live scenes fall back to the green test pattern.
- Admin credentials (default `admin`/`admin`).

## How to run

```bash
node .claude/skills/meet-screenshots/capture.mjs                          # every scene, both themes
node .claude/skills/meet-screenshots/capture.mjs --list                   # list scene ids and exit
node .claude/skills/meet-screenshots/capture.mjs --scenes login,overview  # subset
node .claude/skills/meet-screenshots/capture.mjs --themes dark --scale 2  # one theme, retina
```

Flags: `--scenes` (csv), `--themes` (`light,dark`), `--width`/`--height`/`--scale`, `--timeout`
(ms, default 30000), `--out`, `--origin`, `--base` (`/meet`), `--user`/`--password`,
`--no-cleanup`, `--headed`, `--list`, `--format` (`webp` default | `png` | `jpeg`),
`--quality` (webp/jpeg, default 82).

### Output format & optimization

Shots are written as **WebP** by default — far smaller than PNG (the E2EE meeting shot drops from
~1.8 MB to ~110 KB at the same 2× resolution), which keeps the docs repo and page loads light.
Playwright only writes png/jpeg, so `saveShot()` captures a throwaway PNG and transcodes it to WebP
with **ffmpeg** (`libwebp`, `--quality`). Use `--format png` for lossless output or `--format jpeg`
when WebP isn't wanted. All scenes (static and live) go through `saveShot()`, so the format flag
applies everywhere; the file extension follows the format.

### Live meeting scenes & the sample webcam

Most scenes are single static pages, but **live scenes** (`live: true`) drive a real
multi-participant meeting — `e2ee-wrong-key` (the wrong-key lockout, in an E2EE room),
`layout-settings` (the Mosaic / Smart Mosaic modes and visible-participants slider) and
`layout-grid` (6 participants — Smart Mosaic's default 4 visible slots leave a "+1" badge — with the participants panel open).

**Each participant runs in its own browser** (one `chromium.launch` per person), because a single
browser can only feed one fake-camera file to all its tabs. Each browser is launched with
`--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` and a per-person
`--use-file-for-fake-video-capture` pointing at a Y4M transcoded from that person's portrait
(`sampleY4mFor()` via **ffmpeg**, cached per file). So every tile shows a **different** real
person — no repeated faces in a meeting. If ffmpeg or an image is missing, that participant falls
back to the green test pattern.

Faces and names come from `SAMPLE_ROSTER` in `capture.mjs` (portraits in `assets/`, each paired
with a gender-appropriate name: Emma, David, Sarah, James, Zoe). The first roster entry is the
captured viewer; the rest are remote tiles in join order. Participants beyond the roster get
`OVERFLOW_NAMES` and reuse a face — fine because Smart Mosaic hides them (only the name shows in
the "+N" badge), so no duplicate face is ever rendered. To change the cast, edit `SAMPLE_ROSTER`
and drop matching images into `assets/`. Live scenes seed their own room per theme (E2EE for
`e2ee-wrong-key`, plain for the layout scenes) and delete it afterwards, so they don't collide with
the empty-state safety checks.

Live captures juggle several browsers, so they are more timing-sensitive than static pages. All
live scenes retry once per theme automatically; if one still times out, re-run just that theme
(`--themes dark`). Heavier scenes (e.g. `layout-grid`, 6 participants) flake more often.

Mechanics: logs in **once** via the UI and reuses `storageState` across all contexts (repeated
logins trip the backend rate limiter); forces theme via `localStorage['ovMeet-theme']` +
`colorScheme`; seeds demo rooms via REST for populated scenes and **deletes only those**; each shot
retries up to 3× with backoff (data-heavy pages occasionally stall late in a long run).

## Output naming — by domain + navigation path

`<out>/<domain>/<navpath>[-state]-<theme>.<ext>` (folder = frontend domain, file = nav path + state + theme; `<ext>` follows `--format`, WebP by default).
The default run produces **38 WebP images** (19 scenes × 2 themes):

```
auth/      login
console/   overview · overview-empty · embedded · config · error
meeting/   disconnected · e2ee-wrong-key · layout-settings · layout-grid
rooms/     rooms-empty · rooms-3rooms · rooms-new · rooms-detail · rooms-edit
recordings/recordings
users/     users · users-new · profile
```

`e2ee-wrong-key`, `layout-settings` and `layout-grid` are live multi-participant scenes (see
"Live meeting scenes & the sample webcam" above); they need the app running plus ffmpeg for the
sample webcam. Drop them with an explicit `--scenes` list if you only want the static pages.

## Scene catalog (built into capture.mjs)

| Scene id | Domain | Route | Auth | Seeding | waitFor selector |
|---|---|---|---|---|---|
| `login` | auth | `/login` | none | — | `#login-button` |
| `error` | console | `/error` | none | — | `.error-title` |
| `disconnected` | meeting | `/disconnected` | none | — | `#disconnect-title` |
| `overview-empty` | console | `/overview` | admin | **0 rooms** | `#create-first-room-button` |
| `rooms-empty` | rooms | `/rooms` | login | **0 rooms** | `.no-rooms-state h3` |
| `rooms-new` | rooms | `/rooms/new` | admin/user | — | `.wizard-header` |
| `recordings` | recordings | `/recordings` | login | — | `h1:text-is("Recordings")` |
| `users` | users | `/users` | admin | — | `#users-heading` |
| `users-new` | users | `/users/new` | admin | — | `h1:has-text("Create User")` |
| `profile` | users | `/profile` | login | — | `h1:text-is("Profile")` |
| `config` | console | `/config` | admin | — | `h1:has-text("Visual Customization")` |
| `embedded` | console | `/embedded` | admin | — | `h1:has-text("Embedded")` |
| `overview` | console | `/overview` | admin | **3 rooms** | `#create-room-button` |
| `rooms-list` | rooms | `/rooms` | login | **3 rooms** | `#rooms-table` |
| `room-detail` | rooms | `/rooms/:id` | login | **3 rooms** | `h1` = seeded room name |
| `room-edit` | rooms | `/rooms/:id/edit` | admin/user | **3 rooms** | `.wizard-header` |
| `e2ee-wrong-key` | meeting | `/room/:id` (live, ×3; wrong-key participant's view) | anon (REST-seeded E2EE room) | **own E2EE room** | `.encryption-warning` |
| `layout-settings` | meeting | `/room/:id` (live, ×2) | anon (REST-seeded room) | **own room** | `.participant-slider` |
| `layout-grid` | meeting | `/room/:id` (live, ×6; 4 visible + "+1" badge, participants panel) | anon (REST-seeded room) | **own room** | `ov-participants-panel` |

## Full UI route map (source: `domains/<domain>/routes/*.routes.ts`)

Routes are assembled in `shared/routes/base-routes.ts`. Public routes sit at the top level under
`/meet`; console routes are children of an authenticated shell (`''` redirects to `overview`).
Nav order: Overview(1) · Rooms(2) · Recordings(3) · Users(4) · Embedded(5) · Configuration(6).

| Domain | Route (under `/meet`) | Roles / guard | Screenshot status |
|---|---|---|---|
| auth | `/login` | unauthenticated only | ✅ `login` |
| auth | `/change-password-required` | auth + must-change-password | 🔒 needs a user flagged mustChangePassword |
| meeting | `/room/:room-id` | room meeting access (token/secret) | ✅ `e2ee-wrong-key` (live, multi-participant) · other meeting states still 🔒 |
| meeting | `/disconnected` | none | ✅ `disconnected` |
| recordings | `/room/:room-id/recordings` | `?secret` | 🔒 needs share secret |
| recordings | `/recording/:recording-id` | `?secret` | 🔒 needs share secret |
| console | `/overview` | ADMIN | ✅ `overview` / `overview-empty` |
| console | `/embedded` | ADMIN | ✅ `embedded` |
| console | `/config` | ADMIN | ✅ `config` |
| console | `/error` | none | ✅ `error` |
| rooms | `/rooms` | ADMIN, USER, ROOM_MEMBER | ✅ `rooms-empty` / `rooms-list` |
| rooms | `/rooms/new` | ADMIN, USER | ✅ `rooms-new` |
| rooms | `/rooms/:room-id` | room access | ✅ `room-detail` (seeded id) |
| rooms | `/rooms/:room-id/edit` | ADMIN/USER + manage + editable | ✅ `room-edit` (seeded id) |
| room-members | `/rooms/:room-id/members/new` | ADMIN/USER + manage | ⚙️ seed a room id, then capture |
| room-members | `/rooms/:room-id/members/:member-id/edit` | ADMIN/USER + manage | ⚙️ seed room + member |
| recordings | `/recordings` | ADMIN, USER, ROOM_MEMBER | ✅ `recordings` (empty; see API note) |
| recordings | `/recordings/:recording-id` | recording access | ⚙️ needs a real recording |
| users | `/users` | ADMIN | ✅ `users` (admin always present) |
| users | `/users/new` | ADMIN | ✅ `users-new` |
| users | `/users/:user-id` | ADMIN, USER | ⚙️ same component as `/profile` |
| users | `/profile` | login | ✅ `profile` |

✅ covered by a default scene · ⚙️ reachable by seeding an entity id (extend the catalog) ·
🔒 needs a live session / share secret / special user state (manual setup).

## REST API reference (for seeding)

Interactive docs (Scalar): **`http://localhost:6080/meet/api/v1/docs`** (public API) and
`http://localhost:6080/meet/internal-api/v1/docs` (internal API). The `/docs` route returns the
HTML reference, not a raw spec JSON.

- **Public API** — base `http://localhost:6080/meet/api/v1`, auth `Authorization: Bearer <token>` or `x-api-key`. Resources: **rooms**, **recordings**, **users**.
- **Internal API** — base `http://localhost:6080/meet/internal-api/v1`. Resources: **auth** (`/login`, `/logout`, `/refresh`), **api-keys**, **users** (`/me`, `/change-password`), **rooms**, **meetings**, **config**, **analytics**, **ai**.

Login (seeding): `POST /internal-api/v1/auth/login {userId,password}` → `accessToken` in body.

Key endpoints used for screenshot seeding:

| Resource | Endpoint | Notes |
|---|---|---|
| Rooms | `POST /api/v1/rooms {roomName}` | create. Returns `{roomId,…}` |
| Rooms | `GET /api/v1/rooms?maxItems=100` | list → `{rooms:[…]}` |
| Rooms | `DELETE /api/v1/rooms/:id?withMeeting=force&withRecordings=force` | **lowercase enums**: withMeeting ∈ `force\|when_meeting_ends\|fail`, withRecordings ∈ `force\|close\|fail`. `force`/`force` deletes immediately. |
| Users | `POST /api/v1/users` (ADMIN) · `GET /api/v1/users` · `DELETE /api/v1/users/:id` | `admin` user always exists → `/users` is never empty |
| Recordings | `GET /api/v1/recordings` · `DELETE /api/v1/recordings/:id` | **`POST /recordings` needs an ACTIVE meeting** (room-member token), so recordings can't be seeded by REST alone — populated recording screens require a real recorded meeting |

**Seedability:** rooms ✅, users ✅, recordings ❌ (need a live meeting).

## Safety rules (important)

- **Never delete pre-existing rooms.** Empty-list scenes (`rooms-empty`, `overview-empty`) preflight
  and **abort** if any room exists, rather than wiping data. If aborted, clear the Rooms screen (or
  drop those scenes from `--scenes`) and retry.
- The script deletes **only the demo rooms it created this run** (tracked by id), with cleanup on by
  default (`--no-cleanup` to keep them). Cleanup uses `force/force` so meeting-less demo rooms go
  immediately.
- Cleanup issues a backend `DELETE`; in stricter permission modes that call may prompt for approval
  (it can't tell the rooms are agent-created). If blocked/failed, the script reports what remains.

## Extending coverage

Add an entry to `ALL_SCENES` in `capture.mjs`. Use the route map above for the path/roles, and pick
a stable `waitFor` (an `id` on the page, or `h1:has-text("…")` / `h1:text-is("…")` — prefer
`:text-is` when a "Loading X" header would otherwise match). For routes needing an entity id, use a
`build(ctx)` scene (see `room-detail`) — `ctx.roomIds` / `ctx.roomNames` are available after seeding.
For new seedable entities (e.g. members), add a REST helper mirroring `createRoom`/`deleteRooms`.
```
