#!/usr/bin/env node
/**
 * meet-videos — record cursor-guided demo videos of the OpenVidu Meet frontend for a
 * product landing page.
 *
 * Sibling of meet-screenshots/capture.mjs and reuses the same machinery (UI login +
 * reused storageState, theme forcing via localStorage 'ovMeet-theme', REST room seeding,
 * per-participant fake-camera browsers for live meetings). Two things are new here:
 *
 *   1. A SYNTHETIC ON-SCREEN CURSOR. Playwright video capture records the page's compositor
 *      output, which does NOT include the OS pointer. So we inject a DOM cursor (installCursor)
 *      that follows real mouse events, and drive it with eased, human-looking motion
 *      (moveCursor) plus a click ripple — that motion is the whole point of these clips.
 *   2. VIDEO RECORDING. Contexts are created with recordVideo (Playwright writes WebM), then
 *      ffmpeg transcodes each clip to the requested FORMAT (mp4 default, or webm/gif/webp).
 *
 * Each "flow" is a scripted, cursor-driven walkthrough rather than a single still:
 *   live-meeting  (meeting) — in-room tour: toggle mic/cam, open chat + send, participants panel
 *   join-meeting  (meeting) — lobby: type name, device preview, Join, land in a populated room
 *   create-room   (rooms)   — rooms list -> Create Room -> basic wizard -> create
 *   console-tour  (console) — cursor sweep across overview / rooms / recordings / users / config
 *
 * Run from the repo root (so Playwright resolves from ./node_modules):
 *   node .claude/skills/meet-videos/record.mjs                          # all flows, both themes
 *   node .claude/skills/meet-videos/record.mjs --list                   # list flow ids and exit
 *   node .claude/skills/meet-videos/record.mjs --flows live-meeting --themes dark
 *
 * SAFETY: never deletes pre-existing rooms. It seeds its own demo rooms (and the room the
 * create-room flow makes through the UI) and removes ONLY those, tracked by id.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ---------- CLI args ----------
const argv = process.argv.slice(2);
const flag = (name, def) => {
	const i = argv.indexOf(`--${name}`);
	if (i === -1) return def;
	const v = argv[i + 1];
	return v && !v.startsWith('--') ? v : true;
};
const has = (name) => argv.includes(`--${name}`);

const ORIGIN = String(flag('origin', 'http://localhost:6080'));
const BASE_PATH = String(flag('base', '/meet'));
const APP = `${ORIGIN}${BASE_PATH}`;
const API = `${APP}/api/v1`;
const INTERNAL = `${APP}/internal-api/v1`;
const OUT = String(flag('out', `${process.cwd()}/videos`));
const USER = String(flag('user', 'admin'));
const PASSWORD = String(flag('password', 'admin'));
const WIDTH = Number(flag('width', 1920));
const HEIGHT = Number(flag('height', 1080));
const SCALE = Number(flag('scale', 1));
const TIMEOUT = Number(flag('timeout', 30000));
const THEMES = String(flag('themes', 'light,dark')).split(',').map((t) => t.trim()).filter(Boolean);
const CLEANUP = !has('no-cleanup');
const HEADED = has('headed');
// Output format: mp4 (default, universal) | webm | gif | webp. Playwright records WebM; ffmpeg
// transcodes to the chosen format. PACE scales every move/pause (>1 slower, <1 faster).
const FORMAT = String(flag('format', 'mp4')).toLowerCase();
const EXT = { mp4: 'mp4', webm: 'webm', gif: 'gif', webp: 'webp' }[FORMAT] || 'mp4';
const CRF = Number(flag('crf', 23)); // mp4/webm quality (lower = better/larger)
const QUALITY = Number(flag('quality', 80)); // gif/webp quality
const FPS = Number(flag('fps', 30));
const GIFW = Number(flag('gif-width', 1000)); // downscale width for gif/webp (full res is huge)
const PACE = Number(flag('pace', 1)); // motion/pause speed multiplier
// Fake-camera sample tuning for VIDEO assets (see resolveAsset/sampleY4mFor). Videos are decoded
// to a raw Y4M that Chromium loops, so keep the clip modest — width×fps×seconds drives its size.
const ASSET_WIDTH = Number(flag('asset-width', 960));
const ASSET_FPS = Number(flag('asset-fps', 12));
const ASSET_SECONDS = Number(flag('asset-seconds', 8)); // max looped length of a video asset
const P = (ms) => Math.max(0, Math.round(ms * PACE));

const SKILL_DIR = fileURLToPath(new URL('.', import.meta.url));
const VIDEO_TMP = `${tmpdir()}/meet-videos-raw`;
const CREATE_ROOM_NAME = 'Product Demo Room';

// Distinct sample portraits fed into the fake webcam so every meeting tile shows a different
// realistic person (mirrors meet-screenshots). Order: [0] is the recorded viewer.
const SAMPLE_ROSTER = [
	{ file: 'girl-01.mp4', name: 'Emma' },
	{ file: 'guy-01.mp4', name: 'David' },
	{ file: 'girl-02.mp4', name: 'Sarah' },
	{ file: 'guy-02.mp4', name: 'James' },
	{ file: 'girl-03.mp4', name: 'Zoe' }
];
const OVERFLOW_NAMES = ['Nina', 'Lucas', 'Mia', 'Omar'];
function rosterFor(count) {
	return Array.from({ length: count }, (_, i) =>
		i < SAMPLE_ROSTER.length
			? SAMPLE_ROSTER[i]
			: { file: SAMPLE_ROSTER[i % SAMPLE_ROSTER.length].file, name: OVERFLOW_NAMES[i - SAMPLE_ROSTER.length] || `Guest ${i + 1}` }
	);
}
const DEMO_ROOM_NAMES = ['Sales Sync', 'Engineering Standup', 'Design Review'];

// ---------- Flow catalog ----------
// UI flows run in a shared logged-in browser (reused storageState); live flows spin up their own
// per-participant fake-camera browsers. drive() is the cursor-guided script for the recorded page.
const ALL_FLOWS = [
	{ id: 'live-meeting', kind: 'live', domain: 'meeting', roomName: 'Team Standup', count: 4, drive: driveLiveMeeting },
	{ id: 'join-meeting', kind: 'live', domain: 'meeting', roomName: 'Weekly Sync', count: 3, drive: driveJoinMeeting },
	// anon: starts logged OUT (it IS the login) — no reused session, no room seeding.
	{ id: 'login', kind: 'ui', anon: true, domain: 'auth', drive: driveLogin },
	{ id: 'create-room', kind: 'ui', domain: 'rooms', drive: driveCreateRoom },
	{ id: 'console-tour', kind: 'ui', domain: 'console', drive: driveConsoleTour },
	// lifecycle: one continuous authed + fake-camera recording (create -> join -> record) that is
	// split by timestamp into 3 clips. Needs an EMPTY room list for the "create first room" card.
	// The host (filmed) publishes hostVideo; a guest joins for the record phase with guestVideo.
	{ id: 'room-lifecycle', kind: 'lifecycle', domain: 'meeting', segments: ['create', 'join', 'record'],
		hostVideo: 'girl-03.mp4', guestVideo: 'guy-01.mp4', guestName: 'David', drive: driveRoomLifecycle }
];

if (has('list')) {
	console.log('Available flows:\n' + ALL_FLOWS.map((f) => `  ${f.id}  (${f.kind}, ${f.domain})`).join('\n'));
	process.exit(0);
}
const flowFilter = flag('flows', null);
const FLOWS = flowFilter ? ALL_FLOWS.filter((f) => String(flowFilter).split(',').includes(f.id)) : ALL_FLOWS;
if (FLOWS.length === 0) {
	console.error(`No flows matched "--flows ${flowFilter}". Available: ${ALL_FLOWS.map((f) => f.id).join(', ')}`);
	process.exit(1);
}

// ---------- REST API helpers (seeding) ----------
async function apiLogin() {
	const res = await fetch(`${INTERNAL}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ userId: USER, password: PASSWORD })
	});
	if (!res.ok) throw new Error(`API login failed: ${res.status} ${await res.text()}`);
	return (await res.json()).accessToken;
}
async function listRooms(token) {
	const res = await fetch(`${API}/rooms?maxItems=100`, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`listRooms failed: ${res.status}`);
	return (await res.json()).rooms ?? [];
}
async function createRoom(token, roomName) {
	const res = await fetch(`${API}/rooms`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ roomName })
	});
	if (!res.ok) throw new Error(`createRoom('${roomName}') failed: ${res.status} ${await res.text()}`);
	return await res.json();
}
// Deletes ONLY the room ids passed in (rooms this script created). force/force (lowercase enum
// values) removes meeting-less, recording-less demo rooms immediately.
async function deleteRooms(token, ids) {
	const failed = [];
	for (const id of ids) {
		const res = await fetch(`${API}/rooms/${encodeURIComponent(id)}?withMeeting=force&withRecordings=force`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` }
		});
		if (!res.ok) failed.push(`${id} (HTTP ${res.status})`);
	}
	return failed;
}
async function waitForRoomCount(token, n) {
	for (let i = 0; i < 40; i++) {
		if ((await listRooms(token)).length >= n) return;
		await new Promise((r) => setTimeout(r, 250));
	}
}
// Full room (incl. access.anonymous.{moderator,speaker}.url) — used to let a guest join a room the
// UI created, since the anonymous URLs aren't returned by the list endpoint.
async function getRoom(token, id) {
	const res = await fetch(`${API}/rooms/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`getRoom(${id}) failed: ${res.status}`);
	return await res.json();
}
async function listRecordings(token) {
	const res = await fetch(`${API}/recordings?maxItems=100`, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) return [];
	return (await res.json()).recordings ?? [];
}
async function deleteRecordings(token, ids) {
	for (const id of ids) {
		await fetch(`${API}/recordings/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
	}
}
// Deletes tool-created rooms + recordings (not in the pre-existing snapshots), polling until the
// slate is clean. Run before AND after each lifecycle theme so light and dark start identical (no
// leftover room or recording) — the key to coherent split clips across themes.
async function cleanToolData(token, preRoomIds, preRecIds) {
	for (let i = 0; i < 40; i++) {
		const rooms = (await listRooms(token)).filter((r) => !preRoomIds.has(r.roomId));
		const recs = (await listRecordings(token)).filter((r) => !preRecIds.has(r.recordingId));
		if (!rooms.length && !recs.length) return;
		if (rooms.length) await deleteRooms(token, rooms.map((r) => r.roomId));
		if (recs.length) await deleteRecordings(token, recs.map((r) => r.recordingId));
		await new Promise((r) => setTimeout(r, 400));
	}
	console.warn('  … clean-slate wait timed out; proceeding');
}

// ---------- Synthetic cursor (injected into every page via addInitScript) ----------
// Playwright video records the page compositor, not the OS pointer, so we draw our own arrow
// cursor that tracks real mouse events and flashes a ripple on click. Survives SPA navigation
// (body persists) and is re-installed on full page loads (window flag resets).
function installCursor() {
	if (window.__ovCursorInstalled) return;
	window.__ovCursorInstalled = true;
	const ID = '__ov_demo_cursor__';
	const build = () => {
		if (!document.body || document.getElementById(ID)) return;
		// Angular Material dialogs/menus/selects render in the browser TOP LAYER, which paints above
		// ALL z-index content — so a plain high-z cursor is hidden behind them. We put the cursor (and
		// the click ripple) in the top layer too via the Popover API, and re-promote the cursor to the
		// top of the top layer whenever a new overlay opens. z-index is a fallback where popover is
		// unsupported.
		const style = document.createElement('style');
		style.textContent = [
			'#' + ID + '{position:fixed;left:0;top:0;inset:auto;margin:0;padding:0;border:0;background:transparent;overflow:visible;width:26px;height:26px;z-index:2147483647;pointer-events:none;will-change:transform;}',
			'#' + ID + '::backdrop{background:transparent;display:none;}',
			'#' + ID + ' svg{display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));transition:transform .09s ease;}',
			'#' + ID + '.down svg{transform:scale(.8);}',
			'.__ov_ripple__{position:fixed;inset:auto;margin:0;padding:0;background:transparent;z-index:2147483646;pointer-events:none;border-radius:50%;border:2px solid rgba(96,165,250,.95);transform:translate(-50%,-50%);}',
			'.__ov_ripple__::backdrop{background:transparent;display:none;}',
			'@keyframes __ov_ripple_kf{from{width:6px;height:6px;opacity:.85;}to{width:56px;height:56px;opacity:0;}}'
		].join('');
		(document.head || document.documentElement).appendChild(style);
		const c = document.createElement('div');
		c.id = ID;
		c.setAttribute('aria-hidden', 'true');
		c.innerHTML =
			'<svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="margin-left:-5px;margin-top:-3px">' +
			'<path d="M5 3 L5 20 L9.5 15.8 L12.6 22.4 L15.1 21.2 L12 14.9 L18 14.9 Z" fill="#ffffff" stroke="#111827" stroke-width="1.4" stroke-linejoin="round"/></svg>';
		c.style.transform = 'translate(-100px,-100px)';
		const canPopover = typeof c.showPopover === 'function';
		if (canPopover) c.setAttribute('popover', 'manual');
		document.body.appendChild(c);
		const promote = () => { if (!canPopover) return; try { c.hidePopover(); } catch (e) {} try { c.showPopover(); } catch (e) {} };
		promote();
		const setPos = (x, y) => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
		window.addEventListener('mousemove', (e) => setPos(e.clientX, e.clientY), true);
		window.addEventListener('mousedown', (e) => {
			c.classList.add('down');
			const r = document.createElement('div');
			r.className = '__ov_ripple__';
			r.style.left = e.clientX + 'px';
			r.style.top = e.clientY + 'px';
			r.style.animation = '__ov_ripple_kf .5s ease-out forwards';
			if (canPopover) r.setAttribute('popover', 'manual');
			document.body.appendChild(r);
			if (canPopover) { try { r.showPopover(); } catch (e) {} }
			promote(); // keep the arrow above the ripple
			setTimeout(() => { try { r.remove(); } catch (e) {} }, 520);
		}, true);
		window.addEventListener('mouseup', () => c.classList.remove('down'), true);
		// Re-promote the cursor above any newly-opened overlay (dialog / menu / select panel / native <dialog>).
		if (canPopover) {
			const OVSEL = '.cdk-overlay-pane,.cdk-overlay-backdrop,.cdk-overlay-container,mat-dialog-container,.mat-mdc-dialog-container,.mat-mdc-menu-panel,.mat-mdc-select-panel,dialog';
			let scheduled = false;
			const schedule = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; promote(); }); };
			const mo = new MutationObserver((muts) => {
				for (const m of muts) for (const n of m.addedNodes) {
					if (n.nodeType === 1 && (n.matches?.(OVSEL) || n.querySelector?.(OVSEL))) { schedule(); return; }
				}
			});
			mo.observe(document.documentElement, { childList: true, subtree: true });
		}
	};
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
	else build();
}

// ---------- Cursor motion helpers ----------
let cursorPos = { x: Math.round(WIDTH / 2), y: Math.round(HEIGHT / 2) };
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Parks the cursor at screen centre so it is visible before the first interaction.
async function parkCursor(page) {
	cursorPos = { x: Math.round(WIDTH / 2), y: Math.round(HEIGHT / 2) };
	await page.mouse.move(cursorPos.x, cursorPos.y);
	await page.waitForTimeout(P(150));
}
// Eased glide from the tracked position to (x,y); many small mouse.move steps make the injected
// cursor follow smoothly. Duration scales with distance (and PACE).
async function moveCursor(page, x, y, { duration } = {}) {
	x = Math.round(x);
	y = Math.round(y);
	const from = cursorPos;
	const dist = Math.hypot(x - from.x, y - from.y);
	if (dist < 1) { cursorPos = { x, y }; return; }
	const dur = P(duration ?? Math.max(260, Math.min(1100, dist * 1.15)));
	const steps = Math.max(10, Math.min(70, Math.round(dist / 11)));
	const stepDelay = Math.max(6, Math.round(dur / steps));
	for (let i = 1; i <= steps; i++) {
		const t = easeInOutQuad(i / steps);
		await page.mouse.move(Math.round(from.x + (x - from.x) * t), Math.round(from.y + (y - from.y) * t));
		await page.waitForTimeout(stepDelay);
	}
	cursorPos = { x, y };
}
// Glides to an element's centre, then performs a real click (dispatches the mouse events the
// injected cursor animates). Uses locator.click for actionability so the click is reliable.
async function clickSelector(page, selector, opts = {}) {
	const el = page.locator(selector).first();
	await el.waitFor({ state: 'visible', timeout: TIMEOUT });
	await el.scrollIntoViewIfNeeded().catch(() => {});
	const box = await el.boundingBox();
	if (box) await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2, opts);
	await page.waitForTimeout(P(120));
	await el.click({ delay: 70 });
	await page.waitForTimeout(P(220));
}
// Glides to a field and focuses it, clears any prefilled value (e.g. the room wizard defaults to
// "Room"), then types with a per-key delay for a natural typing effect. Uses a force click: an
// EMPTY Material form field renders its floating label over the input's centre, so a normal click
// hit-tests the label (a non-descendant) and never lands — force dispatches the real mouse events
// the cursor animates while still focusing the input.
async function typeText(page, selector, text) {
	const el = page.locator(selector).first();
	await el.waitFor({ state: 'visible', timeout: TIMEOUT });
	await el.scrollIntoViewIfNeeded().catch(() => {});
	const box = await el.boundingBox();
	if (box) await moveCursor(page, box.x + box.width / 2, box.y + box.height / 2);
	await page.waitForTimeout(P(120));
	await el.click({ delay: 70, force: true });
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.type(text, { delay: 55 });
	await page.waitForTimeout(P(200));
}

// ---------- Shared meeting helpers (mirror meet-screenshots) ----------
const FAKE_MEDIA_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const ASSET_VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v', 'mkv'];
const ASSET_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
// Resolves a roster file name to the best asset on disk by BASENAME, PREFERRING a video (real
// movement) over a static image — so dropping `<name>.mp4` into assets/ upgrades a portrait
// automatically, and a missing video falls back to the image. Returns { path, isVideo } or null.
function resolveAsset(file) {
	const base = file.replace(/\.[^.]+$/, '');
	const dir = `${SKILL_DIR}assets/`;
	for (const ext of ASSET_VIDEO_EXTS) {
		if (existsSync(`${dir}${base}.${ext}`)) return { path: `${dir}${base}.${ext}`, isVideo: true };
	}
	for (const ext of [file.split('.').pop().toLowerCase(), ...ASSET_IMAGE_EXTS]) {
		if (existsSync(`${dir}${base}.${ext}`)) return { path: `${dir}${base}.${ext}`, isVideo: false };
	}
	return null;
}
// Builds (and caches) the Y4M fed to Chromium's fake camera. A VIDEO asset is decoded frame-by-frame
// (capped by ASSET_* flags) so the tile shows real motion — Chromium loops the Y4M at its end. A
// static image loops a 1s still, as before. Y4M is raw/uncompressed, hence the modest video caps.
const y4mCache = new Map();
function sampleY4mFor(file) {
	if (y4mCache.has(file)) return y4mCache.get(file);
	const asset = resolveAsset(file);
	if (!asset) {
		console.warn(`Sample asset for '${file}' not found in assets/; using default fake camera.`);
		y4mCache.set(file, null);
		return null;
	}
	const out = `${tmpdir()}/meet-sample-${file.replace(/[^a-z0-9]/gi, '_')}.y4m`;
	let result = null;
	try {
		const args = asset.isVideo
			? ['-y', '-i', asset.path, '-an', '-t', String(ASSET_SECONDS), '-r', String(ASSET_FPS),
				'-vf', `scale=${ASSET_WIDTH}:-2,format=yuv420p`, '-pix_fmt', 'yuv420p', out]
			: ['-y', '-loop', '1', '-i', asset.path, '-t', '1', '-r', '10',
				'-vf', 'scale=1280:-2,format=yuv420p', '-pix_fmt', 'yuv420p', out];
		execFileSync('ffmpeg', args, { stdio: 'ignore' });
		result = out;
	} catch (e) {
		console.warn(`Sample asset '${asset.path}' could not be transcoded (${String(e.message || e).split('\n')[0]}); using default fake camera.`);
	}
	y4mCache.set(file, result);
	return result;
}
async function launchCamBrowser(file) {
	const y4m = sampleY4mFor(file);
	const args = [...FAKE_MEDIA_ARGS, ...(y4m ? [`--use-file-for-fake-video-capture=${y4m}`] : [])];
	return chromium.launch({ headless: !HEADED, args });
}
// A meeting participant in its own browser+context. record/cursor turn on video capture + the
// synthetic cursor for the one participant whose view we film; authed reuses the logged-in session
// (for flows that act as an admin AND publish a camera, e.g. the room-lifecycle flow).
async function newParticipant(theme, file, { record = false, cursor = false, authed = false } = {}) {
	const browser = await launchCamBrowser(file);
	const context = await browser.newContext({
		viewport: { width: WIDTH, height: HEIGHT },
		deviceScaleFactor: SCALE,
		colorScheme: theme,
		permissions: ['camera', 'microphone'],
		...(record ? { recordVideo: { dir: VIDEO_TMP, size: { width: WIDTH, height: HEIGHT } } } : {}),
		...(authed && storageState ? { storageState } : {})
	});
	await context.addInitScript((t) => { try { localStorage.setItem('ovMeet-theme', t); } catch {} }, theme);
	if (cursor) await context.addInitScript(installCursor);
	return { browser, context, page: await context.newPage() };
}
// Fast (non-filmed) join used for background participants: fill lobby name, then join.
async function joinMeeting(page, url, { name } = {}) {
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#participant-name-input', { state: 'visible', timeout: TIMEOUT });
	await page.fill('#participant-name-input', name);
	await page.click('#participant-name-submit');
	await page.waitForSelector('#join-button', { state: 'visible', timeout: TIMEOUT });
	await page.click('#join-button');
	await page.waitForSelector('#layout-container', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('#media-buttons-container', { state: 'visible', timeout: TIMEOUT });
}
const remoteTiles = (page, n) =>
	page.waitForFunction((k) => document.querySelectorAll('.OV_stream_video.remote').length >= k, n, { timeout: TIMEOUT });

// ---------- ffmpeg transcode (WebM -> requested format) ----------
function transcodeVideo(srcWebm, relNoExt) {
	const outPath = `${OUT}/${relNoExt}.${EXT}`;
	let args;
	if (FORMAT === 'webm') {
		args = ['-y', '-i', srcWebm, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(CRF), '-r', String(FPS), '-an', outPath];
	} else if (FORMAT === 'gif') {
		args = ['-y', '-i', srcWebm, '-vf',
			`fps=${Math.min(FPS, 18)},scale=${GIFW}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer`,
			outPath];
	} else if (FORMAT === 'webp') {
		args = ['-y', '-i', srcWebm, '-vf', `fps=${FPS},scale=${GIFW}:-1:flags=lanczos`, '-c:v', 'libwebp_anim', '-loop', '0', '-q:v', String(QUALITY), '-an', outPath];
	} else {
		// mp4 (H.264): yuv420p + even dimensions + faststart = plays inline everywhere.
		args = ['-y', '-i', srcWebm, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(CRF),
			'-pix_fmt', 'yuv420p', '-r', String(FPS), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', '-an', outPath];
	}
	execFileSync('ffmpeg', args, { stdio: 'ignore' });
	return `${relNoExt}.${EXT}`;
}

// ---------- Flow drivers (the cursor-guided scripts) ----------
// Login (anon flow): the cursor fills the login form and signs in, landing on the console.
async function driveLogin(page) {
	await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#userId-input', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('#login-button', { state: 'visible', timeout: TIMEOUT });
	await parkCursor(page);
	await page.waitForTimeout(P(900));
	await typeText(page, '#userId-input', USER);
	await page.waitForTimeout(P(400));
	await typeText(page, '#password-input', PASSWORD);
	await page.waitForTimeout(P(500));
	await clickSelector(page, '#login-button');
	await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: TIMEOUT });
	await page.waitForSelector('#nav-list', { state: 'visible', timeout: TIMEOUT }).catch(() => {});
	await page.waitForTimeout(P(2200)); // settle on the console after signing in
}

// UI flows receive the recorded page (already logged in + on a fresh context).
async function driveConsoleTour(page) {
	await page.goto(`${APP}/overview`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#nav-list', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('#nav-link-overview', { state: 'visible', timeout: TIMEOUT });
	await parkCursor(page);
	await page.waitForTimeout(P(1600)); // linger on the overview dashboard
	const stops = [
		['#nav-link-rooms', '#rooms-table'],
		['#nav-link-recordings', 'h1:text-is("Recordings")'],
		['#nav-link-users', '#users-heading'],
		['#nav-link-config', 'h1:has-text("Visual Customization")'],
		['#nav-link-overview', '#nav-link-overview']
	];
	for (const [nav, marker] of stops) {
		await clickSelector(page, nav);
		await page.waitForSelector(marker, { state: 'attached', timeout: TIMEOUT }).catch(() => {});
		await page.waitForTimeout(P(1700));
	}
	await page.waitForTimeout(P(600));
}

async function driveCreateRoom(page) {
	await page.goto(`${APP}/rooms`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#rooms-table', { state: 'attached', timeout: TIMEOUT }).catch(() => {});
	await page.waitForSelector('#create-room-btn', { state: 'visible', timeout: TIMEOUT });
	await parkCursor(page);
	await page.waitForTimeout(P(1200));
	await clickSelector(page, '#create-room-btn'); // -> /rooms/new (basic creation)
	await page.waitForSelector('.wizard-header', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('.room-basic-creation-form input', { state: 'visible', timeout: TIMEOUT });
	await page.waitForTimeout(P(700));
	await typeText(page, '.room-basic-creation-form input', CREATE_ROOM_NAME);
	await page.waitForTimeout(P(600));
	await clickSelector(page, '#create-room-button');
	await page.waitForURL((u) => !u.pathname.includes('/rooms/new'), { timeout: TIMEOUT }).catch(() => {});
	await page.waitForTimeout(P(2400)); // land on the created room / list
}

// Live flows receive the recorded participant's page, the room url, and the roster.
async function driveJoinMeeting(page, url, roster) {
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#participant-name-input', { state: 'visible', timeout: TIMEOUT });
	await parkCursor(page);
	await page.waitForTimeout(P(700));
	await typeText(page, '#participant-name-input', roster[0].name);
	await page.waitForTimeout(P(500));
	await clickSelector(page, '#participant-name-submit');
	await page.waitForSelector('#join-button', { state: 'visible', timeout: TIMEOUT });
	await page.waitForTimeout(P(1100)); // device preview on the prejoin screen
	await clickSelector(page, '#join-button');
	await page.waitForSelector('#layout-container', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('#media-buttons-container', { state: 'visible', timeout: TIMEOUT });
	await remoteTiles(page, Math.min(roster.length - 1, 4)).catch(() => {});
	await page.waitForTimeout(P(2400)); // settle on the joined room
}

async function driveLiveMeeting(page, url, roster) {
	await joinMeeting(page, url, { name: roster[0].name });
	await remoteTiles(page, Math.min(roster.length - 1, 4));
	await parkCursor(page);
	await page.waitForTimeout(P(900));
	// mic off / on
	await clickSelector(page, '#mic-btn');
	await page.waitForTimeout(P(800));
	await clickSelector(page, '#mic-btn');
	await page.waitForTimeout(P(500));
	// camera off / on
	await clickSelector(page, '#camera-btn');
	await page.waitForTimeout(P(1000));
	await clickSelector(page, '#camera-btn');
	await page.waitForTimeout(P(700));
	// open chat and send a message
	await clickSelector(page, '#chat-panel-btn');
	await page.waitForSelector('#chat-input', { state: 'visible', timeout: TIMEOUT });
	await typeText(page, '#chat-input', 'Hey team — great to see everyone! 👋');
	await clickSelector(page, '#send-btn');
	await page.waitForTimeout(P(900));
	// open participants panel, then close it to end on the video grid
	await clickSelector(page, '#participants-panel-btn');
	await page.waitForSelector('ov-participants-panel', { state: 'visible', timeout: TIMEOUT });
	await page.waitForTimeout(P(1500));
	await clickSelector(page, '#participants-panel-btn');
	await page.waitForTimeout(P(1500));
}

// Room-lifecycle (authed + own camera): create a room from the empty overview, join it publishing
// the fake camera, then start recording — one continuous take. mark(name) stamps the elapsed time
// at each phase boundary so the runner can split the take into three clips. ctx.addParticipant()
// brings a second person into the meeting for the record phase.
async function driveRoomLifecycle(page, mark, ctx) {
	const ROOM_NAME = 'Weekly Team Sync';
	// ----- Phase 1: create the room from the (empty) overview -----
	await page.goto(`${APP}/overview`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#nav-list', { state: 'visible', timeout: TIMEOUT });
	// Prefer the empty-state "create first room" card; fall back to the populated button.
	const firstCard = page.locator('#create-first-room-button');
	const createEntry = (await firstCard.isVisible().catch(() => false)) ? '#create-first-room-button' : '#create-room-button';
	await parkCursor(page);
	await page.waitForTimeout(P(1300));
	await clickSelector(page, createEntry); // -> /rooms/new (basic creation)
	await page.waitForSelector('.room-basic-creation-form input', { state: 'visible', timeout: TIMEOUT });
	await page.waitForTimeout(P(700));
	await typeText(page, '.room-basic-creation-form input', ROOM_NAME);
	await page.waitForTimeout(P(500));
	await clickSelector(page, '#create-room-button'); // creates + auto-redirects into the room
	await page.waitForURL((u) => u.pathname.includes('/room/'), { timeout: TIMEOUT }).catch(() => {});
	// The redirect lands on the prejoin (a name lobby may appear first for some roles).
	await Promise.race([
		page.waitForSelector('#participant-name-input', { state: 'visible', timeout: TIMEOUT }).catch(() => {}),
		page.waitForSelector('#join-button', { state: 'visible', timeout: TIMEOUT }).catch(() => {})
	]);
	await page.waitForTimeout(P(1000)); // settle on the created-room prejoin
	mark('create');

	// ----- Phase 2: join the room (publishing the camera) -----
	const nameInput = page.locator('#participant-name-input');
	if (await nameInput.isVisible().catch(() => false)) {
		if (!(await nameInput.inputValue().catch(() => ''))) await typeText(page, '#participant-name-input', 'Admin');
		await clickSelector(page, '#participant-name-submit');
	}
	await page.waitForSelector('#join-button', { state: 'visible', timeout: TIMEOUT });
	await page.waitForTimeout(P(1100)); // device preview on the prejoin
	await clickSelector(page, '#join-button');
	await page.waitForSelector('#layout-container', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('#media-buttons-container', { state: 'visible', timeout: TIMEOUT });
	await page.waitForTimeout(P(2200)); // settle in the meeting, own camera publishing
	mark('join');

	// ----- Phase 3: a guest joins, then start recording (more options -> Start recording) -----
	await ctx.addParticipant(); // second participant joins, publishing another mock video
	await remoteTiles(page, 1).catch(() => {}); // wait for the guest's tile to appear
	await page.waitForTimeout(P(1600)); // settle the 2-person layout
	await clickSelector(page, '#more-options-btn');
	await page.waitForSelector('.mat-mdc-menu-content', { state: 'visible', timeout: TIMEOUT });
	await clickSelector(page, '#recording-btn'); // "Start recording" — begins recording directly
	await page.waitForSelector('ov-recording-activity', { state: 'visible', timeout: TIMEOUT }).catch(() => {});
	await page.waitForTimeout(P(6000)); // linger on the recording state (STARTING -> RECORDING)
	mark('record');
}

// Splits a recorded take into clips by [start, duration] windows (seconds), re-encoding each to the
// output format. Accurate output-seeking (-ss/-t after -i). end=null runs to the end of the take.
function splitSegments(webm, segments) {
	for (const seg of segments) {
		const outPath = `${OUT}/${seg.file}.${EXT}`;
		const window = seg.end != null ? ['-t', String(Math.max(0.1, seg.end - seg.start))] : [];
		const args = ['-y', '-i', webm, '-ss', String(Math.max(0, seg.start)), ...window,
			'-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(CRF), '-pix_fmt', 'yuv420p',
			'-r', String(FPS), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', '-an', outPath];
		execFileSync('ffmpeg', args, { stdio: 'ignore' });
		written.push(`${seg.file}.${EXT}`);
		console.log(`  ✓ ${seg.file}.${EXT}`);
	}
}

// ---------- Runners ----------
const failures = [];
const written = [];
let storageState = null;

async function bootstrapAuth(browser) {
	const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
	const page = await context.newPage();
	await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#userId-input', { timeout: TIMEOUT });
	await page.fill('#userId-input', USER);
	await page.fill('#password-input', PASSWORD);
	await page.click('#login-button');
	await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: TIMEOUT });
	storageState = await context.storageState();
	await context.close();
}

async function runUiFlow(browser, flow, theme) {
	const rel = `${flow.domain}/${flow.id}-${theme}`;
	const ATTEMPTS = 2;
	for (let a = 1; a <= ATTEMPTS; a++) {
		console.log(`[${theme}] ${flow.id}${a > 1 ? ` — retry ${a}` : ''}`);
		const context = await browser.newContext({
			viewport: { width: WIDTH, height: HEIGHT },
			deviceScaleFactor: SCALE,
			colorScheme: theme,
			recordVideo: { dir: VIDEO_TMP, size: { width: WIDTH, height: HEIGHT } },
			...(!flow.anon && storageState ? { storageState } : {}) // anon flows (login) start logged out
		});
		await context.addInitScript((t) => { try { localStorage.setItem('ovMeet-theme', t); } catch {} }, theme);
		await context.addInitScript(installCursor);
		const page = await context.newPage();
		const video = page.video();
		try {
			cursorPos = { x: Math.round(WIDTH / 2), y: Math.round(HEIGHT / 2) };
			await flow.drive(page);
			await context.close(); // finalizes the video file
			const out = transcodeVideo(await video.path(), rel);
			try { unlinkSync(await video.path()); } catch {}
			written.push(out);
			console.log(`  ✓ ${out}`);
			return;
		} catch (e) {
			await context.close().catch(() => {});
			const msg = String(e.message || e).split('\n')[0];
			if (a < ATTEMPTS) {
				console.warn(`  … retry ${rel} (${msg})`);
				await new Promise((r) => setTimeout(r, 1500));
				continue;
			}
			failures.push(`${rel} (${msg})`);
			console.warn(`  ✗ ${rel}: ${msg}`);
		}
	}
}

async function runLiveFlow(token, flow, theme) {
	const rel = `${flow.domain}/${flow.id}-${theme}`;
	const roster = rosterFor(flow.count);
	const ATTEMPTS = 2; // multi-browser joins are timing-sensitive; one retry absorbs races
	for (let a = 1; a <= ATTEMPTS; a++) {
		console.log(`[${theme}] ${flow.id} (live, ${flow.count} participants)${a > 1 ? ` — retry ${a}` : ''}`);
		const room = await createRoom(token, flow.roomName);
		const url = room.access.anonymous.moderator.url;
		const bg = [];
		let rec = null;
		let video = null;
		try {
			// background participants join first (indices 1..count-1)
			for (let i = 1; i < flow.count; i++) {
				const p = await newParticipant(theme, roster[i].file);
				bg.push(p.browser);
				await joinMeeting(p.page, url, { name: roster[i].name });
			}
			// recorded viewer (index 0) — its context has video + cursor; drive() joins + performs the tour
			rec = await newParticipant(theme, roster[0].file, { record: true, cursor: true });
			video = rec.page.video();
			cursorPos = { x: Math.round(WIDTH / 2), y: Math.round(HEIGHT / 2) };
			await flow.drive(rec.page, url, roster);
			await rec.context.close(); // finalizes the video file
			const out = transcodeVideo(await video.path(), rel);
			try { unlinkSync(await video.path()); } catch {}
			written.push(out);
			console.log(`  ✓ ${out}`);
			break;
		} catch (e) {
			if (rec) await rec.context.close().catch(() => {});
			const msg = String(e.message || e).split('\n')[0];
			if (a < ATTEMPTS) console.warn(`  … retry ${rel} (${msg})`);
			else {
				failures.push(`${rel} (${msg})`);
				console.warn(`  ✗ ${rel}: ${msg}`);
			}
		} finally {
			for (const b of bg) await b.close().catch(() => {});
			if (rec) await rec.browser.close().catch(() => {});
			await deleteRooms(token, [room.roomId]); // self-cleaning: remove only this flow's room
		}
	}
}

// Records the room-lifecycle take (authed host + own fake camera + a guest for the record phase),
// then splits it into per-segment clips. Cleans tool data before AND after each theme so light and
// dark start from an identical empty state (no stored rooms or recordings).
async function runRoomLifecycle(token, flow, theme, preRoomIds, preRecIds) {
	const seg = (name) => `${flow.domain}/${flow.id}-${name}-${theme}`;
	const ATTEMPTS = 2;
	for (let a = 1; a <= ATTEMPTS; a++) {
		console.log(`[${theme}] ${flow.id} (create → join → record; split into ${flow.segments.length})${a > 1 ? ` — retry ${a}` : ''}`);
		await cleanToolData(token, preRoomIds, preRecIds); // identical empty start for every theme
		const rec = await newParticipant(theme, flow.hostVideo, { record: true, cursor: true, authed: true });
		const video = rec.page.video();
		const bgBrowsers = [];
		const marks = {};
		const ctx = {
			// Guest joins the room the host just created (found by id-diff), publishing guestVideo.
			addParticipant: async () => {
				const created = (await listRooms(token)).find((r) => !preRoomIds.has(r.roomId));
				if (!created) throw new Error('created room not found for guest join');
				const full = await getRoom(token, created.roomId);
				const url = full.access?.anonymous?.moderator?.url || full.access?.anonymous?.speaker?.url;
				if (!url) throw new Error('no anonymous access url for guest join');
				const p = await newParticipant(theme, flow.guestVideo);
				bgBrowsers.push(p.browser);
				await joinMeeting(p.page, url, { name: flow.guestName });
			}
		};
		try {
			cursorPos = { x: Math.round(WIDTH / 2), y: Math.round(HEIGHT / 2) };
			const t0 = Date.now();
			await flow.drive(rec.page, (name) => { marks[name] = (Date.now() - t0) / 1000; }, ctx);
			await rec.context.close(); // finalizes the take
			splitSegments(await video.path(), [
				{ file: seg('create'), start: 0, end: marks.create },
				{ file: seg('join'), start: marks.create, end: marks.join },
				{ file: seg('record'), start: marks.join, end: null }
			]);
			try { unlinkSync(await video.path()); } catch {}
			break;
		} catch (e) {
			await rec.context.close().catch(() => {});
			const msg = String(e.message || e).split('\n')[0];
			if (a < ATTEMPTS) console.warn(`  … retry ${flow.id}-${theme} (${msg})`);
			else { failures.push(`${flow.id}-${theme} (${msg})`); console.warn(`  ✗ ${flow.id}-${theme}: ${msg}`); }
		} finally {
			await rec.browser.close().catch(() => {});
			for (const b of bgBrowsers) await b.close().catch(() => {});
			await cleanToolData(token, preRoomIds, preRecIds); // leave no trace (room + recordings)
		}
	}
}

// ---------- Main ----------
const token = await apiLogin();
const preExistingIds = new Set((await listRooms(token)).map((r) => r.roomId));
for (const d of new Set(FLOWS.map((f) => f.domain))) await mkdir(`${OUT}/${d}`, { recursive: true });
await mkdir(VIDEO_TMP, { recursive: true });
console.log(`Output: ${OUT}  |  ${WIDTH}x${HEIGHT}@${SCALE}x  |  ${FORMAT}  |  themes: ${THEMES.join(', ')}  |  flows: ${FLOWS.map((f) => f.id).join(', ')}`);

const uiFlows = FLOWS.filter((f) => f.kind === 'ui');
const liveFlows = FLOWS.filter((f) => f.kind === 'live');
const lifecycleFlows = FLOWS.filter((f) => f.kind === 'lifecycle');
const trackedRoomIds = [];

// A logged-in session is needed by non-anon UI flows and by lifecycle flows. Capture it once —
// storageState is portable across browsers, including the per-participant fake-camera browsers.
if (uiFlows.some((f) => !f.anon) || lifecycleFlows.length) {
	const authBrowser = await chromium.launch({ headless: !HEADED });
	try { await bootstrapAuth(authBrowser); } finally { await authBrowser.close(); }
}

// UI flows in a shared browser; seed populated data for the non-anon ones.
if (uiFlows.length) {
	const browser = await chromium.launch({ headless: !HEADED });
	try {
		if (uiFlows.some((f) => !f.anon)) {
			const names = DEMO_ROOM_NAMES.slice(0, 3);
			for (const n of names) trackedRoomIds.push((await createRoom(token, n)).roomId);
			await waitForRoomCount(token, 3);
			console.log(`Seeded ${names.length} demo room(s): ${names.join(', ')}`);
		}
		for (const flow of uiFlows) for (const theme of THEMES) await runUiFlow(browser, flow, theme);
	} finally {
		await browser.close();
	}
}

// Lifecycle flows: own fake-camera browser, split output, self-cleaning. Snapshot the current
// rooms + recordings as the baseline to protect; the flow creates/removes only its own data so
// every theme starts from an identical empty state. Needs an empty overview for the first-room card.
if (lifecycleFlows.length) {
	const preRoomIds = new Set((await listRooms(token)).map((r) => r.roomId));
	const preRecIds = new Set((await listRecordings(token)).map((r) => r.recordingId));
	for (const flow of lifecycleFlows) for (const theme of THEMES) await runRoomLifecycle(token, flow, theme, preRoomIds, preRecIds);
}

// Live flows: each seeds + deletes its own room.
for (const flow of liveFlows) for (const theme of THEMES) await runLiveFlow(token, flow, theme);

// Track the room the create-room flow made through the UI. We can't read its id from the UI, so
// we sweep for rooms that appeared during this run (not pre-existing, not already-tracked seeds).
// This never touches pre-existing rooms, and by cleanup time live-flow rooms have self-deleted.
if (uiFlows.some((f) => f.id === 'create-room')) {
	for (const r of await listRooms(token)) {
		if (!preExistingIds.has(r.roomId) && !trackedRoomIds.includes(r.roomId)) trackedRoomIds.push(r.roomId);
	}
}

// Cleanup: remove only rooms we created (seeded demo rooms + the UI-created room).
if (CLEANUP && trackedRoomIds.length) {
	const ids = [...new Set(trackedRoomIds)];
	const failed = await deleteRooms(token, ids);
	console.log(failed.length ? `\nNOTE: could not remove demo room(s): ${failed.join(', ')}.` : `Cleaned up ${ids.length} demo room(s). Room list restored.`);
} else if (!CLEANUP && trackedRoomIds.length) {
	console.log(`Left ${new Set(trackedRoomIds).size} demo room(s) in place (--no-cleanup).`);
}

console.log(`\n${written.length} video(s) written to ${OUT}.`);
if (failures.length) console.warn(`${failures.length} flow(s) failed:\n  - ` + failures.join('\n  - '));
console.log('DONE');
