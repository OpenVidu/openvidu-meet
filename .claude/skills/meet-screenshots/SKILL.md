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
`--no-cleanup`, `--headed`, `--list`.

Mechanics: logs in **once** via the UI and reuses `storageState` across all contexts (repeated
logins trip the backend rate limiter); forces theme via `localStorage['ovMeet-theme']` +
`colorScheme`; seeds demo rooms via REST for populated scenes and **deletes only those**; each shot
retries up to 3× with backoff (data-heavy pages occasionally stall late in a long run).

## Output naming — by domain + navigation path

`<out>/<domain>/<navpath>[-state]-<theme>.png` (folder = frontend domain, file = nav path + state + theme).
The default run produces **32 PNGs** (16 scenes × 2 themes):

```
auth/      login
console/   overview · overview-empty · embedded · config · error
meeting/   disconnected
rooms/     rooms-empty · rooms-3rooms · rooms-new · rooms-detail · rooms-edit
recordings/recordings
users/     users · users-new · profile
```

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

## Full UI route map (source: `domains/<domain>/routes/*.routes.ts`)

Routes are assembled in `shared/routes/base-routes.ts`. Public routes sit at the top level under
`/meet`; console routes are children of an authenticated shell (`''` redirects to `overview`).
Nav order: Overview(1) · Rooms(2) · Recordings(3) · Users(4) · Embedded(5) · Configuration(6).

| Domain | Route (under `/meet`) | Roles / guard | Screenshot status |
|---|---|---|---|
| auth | `/login` | unauthenticated only | ✅ `login` |
| auth | `/change-password-required` | auth + must-change-password | 🔒 needs a user flagged mustChangePassword |
| meeting | `/room/:room-id` | room meeting access (token/secret) | 🔒 live LiveKit session + join token |
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
