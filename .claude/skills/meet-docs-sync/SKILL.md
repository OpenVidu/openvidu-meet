---
name: meet-docs-sync
description: Bring the OpenVidu Meet screenshots and videos of openvidu.io up to date with the code, for a release or after a UI change. Use when asked to sync, update, refresh or recapture the images or videos of the docs or the website (for example "sincroniza las imágenes y vídeos de openvidu.io de esta release"). Lists the stale assets, recaptures the agreed ones with meet-screenshots and meet-videos straight into the openvidu.io checkout, compares them with the published ones and commits on `next`.
---

# Sync the openvidu.io Meet assets

The assets live in `<openvidu.io>/docs/assets/{images,videos}/meet/`, one `-light` and one `-dark` file each.
Every flow of `meet-videos/record.mjs` and every openvidu.io scene of `meet-screenshots/capture.mjs` is named
after the asset it writes and uses the asset's folder as output, so `--out <openvidu.io>/docs/assets`
overwrites the published file and `git` in openvidu.io holds the old one.

## Steps

1. **List the stale assets.**
   `node .claude/skills/meet-docs-sync/stale.mjs --since <previous release tag>` (default: the latest tag).
   An asset is stale when a template or stylesheet of the frontend paths its screen is built from changed
   after its last commit in openvidu.io. Each line names its producer: `record <flow>`, `capture <scene>`,
   `manual: <origin>` (made in another app or by hand) or `no producer yet`. `--commits` lists every commit.
   The list is a candidate set: a refactor of a template can leave the screen identical.
2. **Agree the scope before capturing anything.** Ask once (AskUserQuestion), grouping the stale assets by
   what changed on screen, with the recommended group first. Settle doubtful ones by opening the committed
   asset next to one current screenshot instead of recording them.
3. **Start an empty stack from the main checkout**, whose frontend bundle must be current (`./meet.sh doctor`,
   line `frontend-bundle`): `./meet.sh stack up docs`. Flows that seed data refuse a backend with rooms or
   extra users, because the lists in the clips must show only what they seed.
4. **Recapture**: run the commands `stale.mjs` prints, reduced to the agreed assets. They have the form
   `./meet.sh stack run docs -- node .claude/skills/meet-videos/record.mjs --flows a,b --out <openvidu.io>/docs/assets`
   (and `capture.mjs --scenes ...`). A failure prints the failing line and the path of a screenshot taken then.
5. **An agreed asset with no producer yet**: add a flow or scene named after it (see "Adding a producer").
6. **Compare**: `node .claude/skills/meet-docs-sync/compare.mjs` prints old -> new resolution, size, length
   and unique frames per second, flags `WORSE?` (smaller, or under 90% of the old fluidity) and writes a
   sheet per asset. Look at every sheet: composition, empty space, cast, highlights. Restore a worse
   recapture with `git -C <openvidu.io> restore <path>`, unless the published asset shows a screen that no
   longer exists; then keep the new one and tell the user what is worse.
7. **Commit in openvidu.io on `next`** (no worktree there), staging only the asset folders:
   `git -C <openvidu.io> add docs/assets/images/meet docs/assets/videos/meet`, message `meet: ...` ending in
   `Assisted-by: Claude`. Then `./meet.sh stack down docs`.
8. **Report**: what was recaptured, what was discarded and why, and the openvidu.io pages whose text still
   describes the old screen (this task changes assets only; release notes are written on release day).

## Adding a producer

- Reproduce the committed composition. For a video, read a contact sheet of it:
  `ffmpeg -i old.mp4 -vf "fps=12/<seconds>,scale=480:-2,tile=4x3" -frames:v 1 sheet.png`.
  For an image, check its size (`ffprobe`), its crop and its highlights.
- Console clips: a `kind: 'ui'` flow with `seed` (rooms and users through the REST API) and `startOnList`,
  which trims the clip to the loaded list. Meeting clips: a `kind: 'live'` flow (`authed: true` when the
  filmed participant is the logged-in admin).
- Screenshots that need interaction: a `scripted` scene with `outputs`, like `captureRoomWizard` (green
  frame) or `captureParticipantsPanel` (green arrow and crop). Keep the asset's extension (`format`).
- Run it on one theme first (`--themes light`), compare, then both.

## Traps met so far

- The room list's access button opens a new tab and Playwright records each page apart: `access-room`
  replaces `window.open` so the take stays in one tab.
- Everyone joining by the anonymous moderator URL is a moderator (shield in the participants panel): plain
  participants join by `access.anonymous.speaker.url`.
- The advanced room wizard has five steps: Live broadcast sits between Recording and Room Access.
- A mouse left over a toolbar button leaves its tooltip in the shot: park it over empty space.
- Recordings cannot be seeded through the REST API alone (they need a live meeting), so the recording
  detail clips start from a real recorded meeting.
- Fluidity of live clips depends on the machine's load: about 24 unique fps is what a quiet machine gives
  with three participants.
