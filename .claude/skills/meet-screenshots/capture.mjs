#!/usr/bin/env node
/**
 * meet-screenshots — capture documentation screenshots of the OpenVidu Meet frontend.
 *
 * Drives the running app with Playwright (Chromium): logs in through the UI, forces
 * light/dark theme, seeds demo rooms when a scene needs them, and writes PNGs named
 *   <out>/<domain>/<navpath>[-state]-<theme>.png
 *
 * The scene catalog below mirrors the UI routes declared in each domain's *.routes.ts
 * (see SKILL.md for the full route map). Standard documentation resolution is
 * 1920x1080 (Full HD), deviceScaleFactor 1; pass --scale 2 for HiDPI (-> 3840x2160).
 *
 * Run from the repo root (so Playwright resolves from ./node_modules):
 *   node .claude/skills/meet-screenshots/capture.mjs                 # every scene, both themes
 *   node .claude/skills/meet-screenshots/capture.mjs --list          # list scene ids and exit
 *   node .claude/skills/meet-screenshots/capture.mjs --scenes login,overview,rooms-list --themes dark
 *
 * SAFETY: scenes that need an empty list refuse to run if rooms already exist — this
 * script NEVER deletes pre-existing data. It only removes the demo rooms it created.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
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
const OUT = String(flag('out', `${process.cwd()}/screenshots`));
const USER = String(flag('user', 'admin'));
const PASSWORD = String(flag('password', 'admin'));
const WIDTH = Number(flag('width', 1920));
const HEIGHT = Number(flag('height', 1080));
const SCALE = Number(flag('scale', 1));
const TIMEOUT = Number(flag('timeout', 30000));
const THEMES = String(flag('themes', 'light,dark')).split(',').map((t) => t.trim()).filter(Boolean);
const CLEANUP = !has('no-cleanup');
const HEADED = has('headed');
// Output format: webp (default, smallest) | png | jpeg. WebP is produced by transcoding the PNG
// screenshot with ffmpeg (Playwright itself only writes png/jpeg).
const FORMAT = String(flag('format', 'webp')).toLowerCase();
const QUALITY = Number(flag('quality', 82)); // webp/jpeg quality (0–100)
// Sample portraits driven into the fake webcam for live meeting scenes, so every participant in a
// meeting shows a DIFFERENT realistic person (not Chromium's green test pattern, and never the same
// face twice). Each participant runs in its own browser launched with its own sample → its own feed.
// Order matters: the first entry is the captured viewer; the rest are remote tiles in join order.
const SKILL_DIR = fileURLToPath(new URL('.', import.meta.url));
const SAMPLE_ROSTER = [
	{ file: 'female_doctor_sample.jpg', name: 'Emma' },
	{ file: 'guy-sample01.jpg', name: 'David' },
	{ file: 'girl-sample01.jpg', name: 'Sarah' },
	{ file: 'guy-sample02.jpg', name: 'James' },
	{ file: 'girl-sample02.jpg', name: 'Zoe' }
];
// Names for participants beyond the distinct-sample roster (these end up hidden behind the "+N"
// badge in Smart Mosaic, so their reused face is never rendered — only the name is shown).
const OVERFLOW_NAMES = ['Nina', 'Lucas', 'Mia', 'Omar'];
// Returns `count` participants as {file, name}: distinct samples first, then name-only overflow
// (reusing a face that won't be rendered because Smart Mosaic hides it).
function rosterFor(count) {
	return Array.from({ length: count }, (_, i) =>
		i < SAMPLE_ROSTER.length
			? SAMPLE_ROSTER[i]
			: { file: SAMPLE_ROSTER[i % SAMPLE_ROSTER.length].file, name: OVERFLOW_NAMES[i - SAMPLE_ROSTER.length] || `Guest ${i + 1}` }
	);
}

// Demo rooms created for "populated" scenes (sliced to the count a scene needs).
const DEMO_ROOM_NAMES = ['Sales Sync', 'Engineering Standup', 'Design Review', 'Onboarding 101', 'All Hands'];

// ---------- Scene catalog (mirrors the UI .routes.ts; see SKILL.md) ----------
// Fields: id, auth ('login'|'anon'), requiresEmpty (DB must have 0 rooms),
//         rooms (demo rooms to seed), shots [{domain,path,base,waitFor}] or build(ctx)->shots.
const ALL_SCENES = [
	// --- public / no login required ---
	{ id: 'login', auth: 'anon', shots: [{ domain: 'auth', path: '/login', base: 'login', waitFor: '#login-button' }] },
	{ id: 'error', auth: 'anon', shots: [{ domain: 'console', path: '/error', base: 'error', waitFor: '.error-title' }] },
	{ id: 'disconnected', auth: 'anon', shots: [{ domain: 'meeting', path: '/disconnected', base: 'disconnected', waitFor: '#disconnect-title' }] },

	// --- empty-state scenes (need an empty room list) ---
	{ id: 'overview-empty', requiresEmpty: true, shots: [{ domain: 'console', path: '/overview', base: 'overview-empty', waitFor: '#create-first-room-button' }] },
	{ id: 'rooms-empty', requiresEmpty: true, shots: [{ domain: 'rooms', path: '/rooms', base: 'rooms-empty', waitFor: '.no-rooms-state h3' }] },

	// --- room-count-agnostic console screens (login, any DB state) ---
	{ id: 'rooms-new', shots: [{ domain: 'rooms', path: '/rooms/new', base: 'rooms-new', waitFor: '.wizard-header' }] },
	{ id: 'recordings', shots: [{ domain: 'recordings', path: '/recordings', base: 'recordings', waitFor: 'h1:text-is("Recordings")' }] },
	{ id: 'users', shots: [{ domain: 'users', path: '/users', base: 'users', waitFor: '#users-heading' }] },
	{ id: 'users-new', shots: [{ domain: 'users', path: '/users/new', base: 'users-new', waitFor: 'h1:has-text("Create User")' }] },
	{ id: 'profile', shots: [{ domain: 'users', path: '/profile', base: 'profile', waitFor: 'h1:text-is("Profile")' }] },
	{ id: 'config', shots: [{ domain: 'console', path: '/config', base: 'config', waitFor: 'h1:has-text("Visual Customization")' }] },
	{ id: 'embedded', shots: [{ domain: 'console', path: '/embedded', base: 'embedded', waitFor: 'h1:has-text("Embedded")' }] },

	// --- populated scenes (need >=3 demo rooms) ---
	{ id: 'overview', rooms: 3, shots: [{ domain: 'console', path: '/overview', base: 'overview', waitFor: '#create-room-button' }] },
	{ id: 'rooms-list', rooms: 3, shots: [{ domain: 'rooms', path: '/rooms', base: 'rooms-3rooms', waitFor: '#rooms-table' }] },
	{
		id: 'room-detail',
		rooms: 3,
		build: (ctx) => [{ domain: 'rooms', path: `/rooms/${ctx.roomIds[0]}`, base: 'rooms-detail', waitFor: `h1:has-text(${JSON.stringify(ctx.roomNames[0])})` }]
	},
	{
		id: 'room-edit',
		rooms: 3,
		build: (ctx) => [{ domain: 'rooms', path: `/rooms/${ctx.roomIds[0]}/edit`, base: 'rooms-edit', waitFor: '.wizard-header' }]
	},

	// --- live meeting scene (multi-participant; captured by a dedicated function) ---
	// Seeds an E2EE room and joins THREE anonymous participants: two with the correct
	// passphrase (who chat with each other) and one with a wrong one. Captures the wrong-key
	// participant's view — everyone else is an encryption-error poster with a masked name and the
	// chat stays empty behind the mismatch warning — demonstrating the symmetric E2EE lockout.
	{ id: 'e2ee-wrong-key', live: true, shots: [{ domain: 'meeting', base: 'e2ee-wrong-key' }] },

	// Smart-layout scenes (live, plain rooms). `layout-settings` opens the grid-layout settings
	// panel (Mosaic / Smart Mosaic + visible-participants slider); `layout-grid` shows the adaptive
	// grid with 6 participants (4 visible remotes + a "+1" hidden badge) and the participants panel.
	{ id: 'layout-settings', live: true, shots: [{ domain: 'meeting', base: 'layout-settings' }] },
	{ id: 'layout-grid', live: true, shots: [{ domain: 'meeting', base: 'layout-grid' }] }
];

if (has('list')) {
	console.log('Available scenes:\n' + ALL_SCENES.map((s) => `  ${s.id}`).join('\n'));
	process.exit(0);
}
const sceneFilter = flag('scenes', null);
const SCENES = sceneFilter ? ALL_SCENES.filter((s) => String(sceneFilter).split(',').includes(s.id)) : ALL_SCENES;
if (SCENES.length === 0) {
	console.error(`No scenes matched "--scenes ${sceneFilter}". Available: ${ALL_SCENES.map((s) => s.id).join(', ')}`);
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
// Creates a room with end-to-end encryption enabled and returns the full room (its
// access.anonymous.{moderator,speaker}.url links let participants join without logging in).
async function createE2eeRoom(token, roomName) {
	const res = await fetch(`${API}/rooms`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ roomName, config: { e2ee: { enabled: true } } })
	});
	if (!res.ok) throw new Error(`createE2eeRoom('${roomName}') failed: ${res.status} ${await res.text()}`);
	return await res.json();
}
// Deletes ONLY the room ids passed in (rooms this script created). force/force (lowercase
// enum values) removes meeting-less, recording-less demo rooms immediately.
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

// ---------- UI helpers ----------
async function uiLogin(page) {
	await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#userId-input', { timeout: 30000 });
	await page.fill('#userId-input', USER);
	await page.fill('#password-input', PASSWORD);
	await page.click('#login-button');
	await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });
}
// Saves a screenshot of `target` (a Page or Locator) to `<OUT>/<relNoExt>.<ext>` in the chosen
// FORMAT and returns the written relative path. WebP/JPEG are quality-compressed for much smaller
// files than PNG; webp is transcoded from a throwaway PNG via ffmpeg (Playwright can't write webp).
async function saveShot(target, relNoExt) {
	if (FORMAT === 'png') {
		await target.screenshot({ path: `${OUT}/${relNoExt}.png` });
		return `${relNoExt}.png`;
	}
	if (FORMAT === 'jpeg' || FORMAT === 'jpg') {
		await target.screenshot({ path: `${OUT}/${relNoExt}.jpg`, type: 'jpeg', quality: QUALITY });
		return `${relNoExt}.jpg`;
	}
	const tmpPng = `${tmpdir()}/meet-shot-${relNoExt.replace(/[/\\]/g, '_')}.png`;
	await target.screenshot({ path: tmpPng });
	execFileSync('ffmpeg', ['-y', '-i', tmpPng, '-c:v', 'libwebp', '-quality', String(QUALITY), `${OUT}/${relNoExt}.webp`], { stdio: 'ignore' });
	return `${relNoExt}.webp`;
}

const failures = [];
async function capture(page, shot, theme) {
	const relNoExt = `${shot.domain}/${shot.base}-${theme}`;
	// 'attached' (not 'visible'): every waitFor selector below is a loaded-state marker that
	// is absent during loading, so attachment == ready — and it dodges flaky theme-transition
	// visibility races. Retries with backoff absorb occasional slow route/data loads on
	// data-heavy pages (api-keys, rooms query) late in a long run.
	const ATTEMPTS = 3;
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			await page.goto(`${APP}${shot.path}`, { waitUntil: 'domcontentloaded' });
			await page.waitForSelector(shot.waitFor, { state: 'attached', timeout: TIMEOUT });
			await page.waitForTimeout(900); // settle fonts / material ripple / animations
			const rel = await saveShot(page, relNoExt);
			console.log(`  ✓ ${rel}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
			return;
		} catch (e) {
			if (attempt < ATTEMPTS) {
				console.warn(`  … retry ${relNoExt} (attempt ${attempt} failed)`);
				await page.waitForTimeout(2000 * attempt); // backoff
				continue;
			}
			failures.push(`${relNoExt} (${shot.path} — waitFor ${shot.waitFor})`);
			console.warn(`  ✗ ${relNoExt}: ${String(e.message || e).split('\n')[0]}`);
		}
	}
}
// Logged-in session captured once and reused, so we hit the auth endpoint a single time
// (repeated UI logins trip the backend's rate limiter).
let storageState = null;
async function bootstrapAuth(browser) {
	const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
	const page = await context.newPage();
	await uiLogin(page);
	storageState = await context.storageState(); // localStorage tokens + cookies
	await context.close();
}
async function newThemedPage(browser, theme, authenticated) {
	const context = await browser.newContext({
		viewport: { width: WIDTH, height: HEIGHT },
		deviceScaleFactor: SCALE,
		colorScheme: theme,
		...(authenticated && storageState ? { storageState } : {})
	});
	// The app reads theme from localStorage 'ovMeet-theme'; index.html applies data-theme
	// before first paint. addInitScript runs before page scripts, overriding any stored value.
	await context.addInitScript((t) => { try { localStorage.setItem('ovMeet-theme', t); } catch {} }, theme);
	return { context, page: await context.newPage() };
}
async function runWave(browser, scenes, { authenticated, ctx } = {}) {
	if (!scenes.length) return;
	for (const theme of THEMES) {
		console.log(`[${theme}] ${scenes.map((s) => s.id).join(', ')}`);
		const { context, page } = await newThemedPage(browser, theme, authenticated);
		for (const scene of scenes) {
			const shots = scene.build ? scene.build(ctx) : scene.shots;
			for (const shot of shots) await capture(page, shot, theme);
		}
		await context.close();
	}
}

// ---------- Live meeting scenes (multi-participant) ----------
// Chromium's fake webcam shows a green test pattern, and one browser can only feed ONE file to all
// its tabs — so each participant runs in its own browser, launched with its own sample video. To
// make a tile look real we transcode the sample image into a 1s looping Y4M and feed it via
// --use-file-for-fake-video-capture. Y4Ms are built once per file and cached.
const FAKE_MEDIA_ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const y4mCache = new Map();
function sampleY4mFor(file) {
	if (y4mCache.has(file)) return y4mCache.get(file);
	const out = `${tmpdir()}/meet-sample-${file.replace(/[^a-z0-9]/gi, '_')}.y4m`;
	let result = null;
	try {
		execFileSync(
			'ffmpeg',
			['-y', '-loop', '1', '-i', `${SKILL_DIR}assets/${file}`, '-t', '1', '-r', '10',
				'-vf', 'scale=1280:-2,format=yuv420p', '-pix_fmt', 'yuv420p', out],
			{ stdio: 'ignore' }
		);
		result = out;
	} catch (e) {
		console.warn(`Sample video '${file}' unavailable (${String(e.message || e).split('\n')[0]}); using default fake camera.`);
	}
	y4mCache.set(file, result);
	return result;
}
// Launches a dedicated browser whose fake camera plays `file`'s portrait (or the green pattern if
// the sample is unavailable). One per participant so every tile shows a different person.
async function launchCamBrowser(file) {
	const y4m = sampleY4mFor(file);
	const args = [...FAKE_MEDIA_ARGS, ...(y4m ? [`--use-file-for-fake-video-capture=${y4m}`] : [])];
	return chromium.launch({ headless: !HEADED, args });
}
// Opens a themed page in its own browser+context for one participant with the given sample.
async function newParticipant(theme, file) {
	const browser = await launchCamBrowser(file);
	const context = await browser.newContext({
		viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE,
		colorScheme: theme, permissions: ['camera', 'microphone']
	});
	await context.addInitScript((t) => { try { localStorage.setItem('ovMeet-theme', t); } catch {} }, theme);
	return { browser, page: await context.newPage() };
}

// Joins a meeting from an anonymous access URL: fills the lobby (name, plus the E2EE passphrase
// when the room is encrypted and a key is given), then joins. Works for plain and E2EE rooms.
async function joinMeeting(page, url, { name, key } = {}) {
	await page.goto(url, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#participant-name-input', { state: 'visible', timeout: TIMEOUT });
	await page.fill('#participant-name-input', name);
	if (key) {
		const e2eeInput = page.locator('#participant-e2eekey-input');
		if (await e2eeInput.isVisible().catch(() => false)) await e2eeInput.fill(key);
	}
	await page.click('#participant-name-submit');
	await page.waitForSelector('#join-button', { state: 'visible', timeout: TIMEOUT });
	await page.click('#join-button');
	await page.waitForSelector('#layout-container', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('#media-buttons-container', { state: 'visible', timeout: TIMEOUT });
}
async function openChatPanel(page) {
	if (!(await page.locator('#chat-input').isVisible().catch(() => false))) {
		await page.locator('#chat-panel-btn').click();
	}
	await page.waitForSelector('#chat-container', { state: 'visible', timeout: TIMEOUT });
	await page.waitForSelector('#chat-input', { state: 'visible', timeout: TIMEOUT });
}
async function sendChatMessage(page, message) {
	await page.locator('#chat-input').fill(message);
	await page.locator('#send-btn').click();
}
// Opens the grid-layout settings panel (More options → Grid layout settings).
async function openLayoutSettings(page) {
	await page.locator('#more-options-btn').click();
	await page.waitForSelector('.mat-mdc-menu-content', { state: 'visible', timeout: TIMEOUT });
	await page.locator('#grid-layout-settings-btn').click();
	await page.waitForSelector('#settings-container', { state: 'visible', timeout: TIMEOUT });
}

// Seeds an E2EE room with two correctly-keyed participants who chat, plus an intruder who joins
// with a WRONG passphrase. Captures the INTRUDER's view per theme, demonstrating the symmetric
// lockout: the other participants render as encryption-error posters with masked names, and the
// chat panel shows the mismatch warning with no readable messages — the active conversation
// between the correctly-keyed participants never reaches the intruder. Anonymous; no UI login.
async function captureE2eeWrongKey(token, shot) {
	const CORRECT = 'team-secret-2024';
	const WRONG = 'different-key-9999';
	// Distinct samples; the intruder (captured) is roster[0], the two correctly-keyed peers follow.
	const [intruderP, correct1P, correct2P] = rosterFor(3);
	const ATTEMPTS = 2; // joining several participants is timing-sensitive; one retry absorbs races
	for (const theme of THEMES) {
		for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
			console.log(`[${theme}] e2ee-wrong-key (live, 3 participants — intruder view)${attempt > 1 ? ` — retry ${attempt}` : ''}`);
			const room = await createE2eeRoom(token, 'Confidential Meeting');
			const url = room.access.anonymous.moderator.url;
			const browsers = [];
			try {
				const mk = async (p) => {
					const { browser, page } = await newParticipant(theme, p.file);
					browsers.push(browser);
					return page;
				};
				// correct1 + correct2 share the right key and chat with each other; intruder has the
				// wrong key and joins last. We capture the intruder, locked out of everyone's content.
				const correct1 = await mk(correct1P);
				const correct2 = await mk(correct2P);
				const intruder = await mk(intruderP);
				await joinMeeting(correct1, url, { name: correct1P.name, key: CORRECT });
				await joinMeeting(correct2, url, { name: correct2P.name, key: CORRECT });
				await joinMeeting(intruder, url, { name: intruderP.name, key: WRONG });

				// A real conversation happens between the correctly-keyed participants.
				await openChatPanel(correct1);
				await openChatPanel(correct2);
				await sendChatMessage(correct1, 'Did you both receive the confidential report?');
				await correct2.waitForFunction(() => document.querySelectorAll('.chat-message').length >= 1, null, { timeout: TIMEOUT });
				await sendChatMessage(correct2, `Yes ${correct1P.name}, got it — all good.`);
				await correct1.waitForFunction(() => document.querySelectorAll('.chat-message').length >= 2, null, { timeout: TIMEOUT });

				// The intruder cannot decrypt anyone: both remotes show the error poster, and the chat
				// shows the mismatch warning with zero readable messages.
				await intruder.waitForFunction(() => document.querySelectorAll('.encryption-error-poster').length >= 2, null, { timeout: TIMEOUT });
				await openChatPanel(intruder);
				await intruder.waitForSelector('.encryption-warning', { state: 'visible', timeout: TIMEOUT });
				await intruder.waitForTimeout(2000); // settle video frames + layout
				if ((await intruder.locator('.chat-message').count()) !== 0) {
					throw new Error('intruder unexpectedly received chat messages');
				}
				const rel = await saveShot(intruder, `${shot.domain}/${shot.base}-${theme}`);
				console.log(`  ✓ ${rel}`);
				break; // success — next theme
			} catch (e) {
				const msg = String(e.message || e).split('\n')[0];
				if (attempt < ATTEMPTS) {
					console.warn(`  … retry e2ee-wrong-key-${theme} (attempt ${attempt} failed: ${msg})`);
				} else {
					failures.push(`${shot.domain}/${shot.base}-${theme} (e2ee-wrong-key)`);
					console.warn(`  ✗ ${shot.domain}/${shot.base}-${theme}: ${msg}`);
				}
			} finally {
				for (const b of browsers) await b.close();
				await deleteRooms(token, [room.roomId]);
			}
		}
	}
}

// Shared driver for the smart-layout scenes: seeds a plain room, joins `count` participants (each a
// distinct person from the roster, in its own browser), runs `afterJoin(viewer)` to set up the
// shot, then captures the first participant's view per theme.
async function captureLayoutScene(token, shot, { count, afterJoin }) {
	const roster = rosterFor(count);
	const ATTEMPTS = 2; // joining several participants is timing-sensitive; one retry absorbs races
	for (const theme of THEMES) {
		for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
			console.log(`[${theme}] ${shot.base} (live, ${count} participants)${attempt > 1 ? ` — retry ${attempt}` : ''}`);
			const room = await createRoom(token, 'Team Meeting');
			const url = room.access.anonymous.moderator.url;
			const browsers = [];
			try {
				const pages = [];
				for (let i = 0; i < count; i++) {
					const { browser, page } = await newParticipant(theme, roster[i].file);
					browsers.push(browser);
					pages.push(page);
				}
				for (let i = 0; i < count; i++) await joinMeeting(pages[i], url, { name: roster[i].name });

				const viewer = pages[0];
				// Smart Mosaic renders at most 4 remote tiles, so wait for the visible ones (not all).
				await viewer.waitForFunction(
					(n) => document.querySelectorAll('.OV_stream_video.remote').length >= n,
					Math.min(count - 1, 4),
					{ timeout: TIMEOUT }
				);
				await afterJoin(viewer);
				await viewer.waitForTimeout(2000); // settle layout transitions
				const rel = await saveShot(viewer, `${shot.domain}/${shot.base}-${theme}`);
				console.log(`  ✓ ${rel}`);
				break; // success — next theme
			} catch (e) {
				const msg = String(e.message || e).split('\n')[0];
				if (attempt < ATTEMPTS) {
					console.warn(`  … retry ${shot.base}-${theme} (attempt ${attempt} failed: ${msg})`);
				} else {
					failures.push(`${shot.domain}/${shot.base}-${theme} (${shot.base})`);
					console.warn(`  ✗ ${shot.domain}/${shot.base}-${theme}: ${msg}`);
				}
			} finally {
				for (const b of browsers) await b.close();
				await deleteRooms(token, [room.roomId]);
			}
		}
	}
}

// Grid-layout settings panel: shows the Mosaic / Smart Mosaic modes and the visible-participants slider.
const captureLayoutSettings = (token, shot) =>
	captureLayoutScene(token, shot, {
		count: 2,
		afterJoin: async (viewer) => {
			await openLayoutSettings(viewer);
			await viewer.waitForSelector('#layout-smart-mosaic', { state: 'visible', timeout: TIMEOUT });
			await viewer.waitForSelector('.participant-slider', { state: 'visible', timeout: TIMEOUT });
		}
	});

// Adaptive grid hero: 6 participants exceed Smart Mosaic's default 4 visible slots, so the viewer
// sees 4 remotes plus the "+1" hidden badge. The participants panel is opened to list everyone.
const captureLayoutGrid = (token, shot) =>
	captureLayoutScene(token, shot, {
		count: 6,
		afterJoin: async (viewer) => {
			await viewer.waitForSelector('ov-hidden-participants-indicator', { state: 'visible', timeout: TIMEOUT });
			await viewer.locator('#participants-panel-btn').click();
			await viewer.waitForSelector('ov-participants-panel', { state: 'visible', timeout: TIMEOUT });
		}
	});

// ---------- Main ----------
const token = await apiLogin();
for (const domain of new Set(SCENES.flatMap((s) => (s.shots ? s.shots.map((sh) => sh.domain) : [])))) {
	await mkdir(`${OUT}/${domain}`, { recursive: true });
}
for (const d of ['rooms']) await mkdir(`${OUT}/${d}`, { recursive: true }); // dynamic (build) scenes write here
console.log(`Output: ${OUT}  |  ${WIDTH}x${HEIGHT}@${SCALE}x  |  ${FORMAT}  |  themes: ${THEMES.join(', ')}  |  scenes: ${SCENES.length}`);

// Shared browser for static (non-live) scenes. Live scenes launch their own per-participant
// browsers (each with its own fake-webcam sample) inside their capture functions.
const liveScenes = SCENES.filter((s) => s.live);
const browser = await chromium.launch({ headless: !HEADED });
try {
	const anon = SCENES.filter((s) => s.auth === 'anon');
	const empties = SCENES.filter((s) => s.requiresEmpty);
	const roomScenes = SCENES.filter((s) => (s.rooms || 0) > 0);
	const agnostic = SCENES.filter((s) => s.auth !== 'anon' && !s.requiresEmpty && !((s.rooms || 0) > 0) && !s.live);
	const needsAuth = empties.length || agnostic.length || roomScenes.length;

	// Wave A — public pages, no login.
	await runWave(browser, anon, { authenticated: false });

	if (needsAuth) await bootstrapAuth(browser); // single login, reused everywhere below

	// Wave B — empty-state + room-agnostic console pages, captured against an empty DB.
	if (empties.length) {
		const pre = await listRooms(token);
		if (pre.length > 0) {
			console.error(
				`\nABORT: ${empties.map((s) => s.id).join(', ')} need an empty room list, but ${pre.length} room(s) ` +
					`already exist. This script will not delete data it did not create.\n` +
					`Clear them from the Rooms screen (or drop the empty scenes from --scenes), then retry.`
			);
			process.exitCode = 2;
		}
	}
	if (process.exitCode !== 2) await runWave(browser, [...empties, ...agnostic], { authenticated: true });

	// Wave C — populated scenes: seed demo rooms, capture, then clean up.
	if (roomScenes.length && process.exitCode !== 2) {
		const need = Math.max(...roomScenes.map((s) => s.rooms));
		const roomNames = DEMO_ROOM_NAMES.slice(0, need);
		const roomIds = [];
		for (const name of roomNames) roomIds.push((await createRoom(token, name)).roomId);
		await waitForRoomCount(token, need);
		console.log(`Seeded ${roomIds.length} demo room(s): ${roomNames.join(', ')}. Capturing populated scenes...`);

		await runWave(browser, roomScenes, { authenticated: true, ctx: { roomIds, roomNames } });

		if (CLEANUP) {
			const failed = await deleteRooms(token, roomIds);
			console.log(failed.length ? `\nNOTE: could not remove demo room(s): ${failed.join(', ')}.` : `Cleaned up ${roomIds.length} demo room(s). Room list restored.`);
		} else {
			console.log(`Left ${roomIds.length} demo room(s) in place (--no-cleanup): ${roomNames.join(', ')}.`);
		}
	}

	// Wave D — live multi-participant meeting scenes (own rooms, self-cleaning).
	if (liveScenes.length && process.exitCode !== 2) {
		const liveRunners = {
			'e2ee-wrong-key': captureE2eeWrongKey,
			'layout-settings': captureLayoutSettings,
			'layout-grid': captureLayoutGrid
		};
		for (const scene of liveScenes) {
			const run = liveRunners[scene.id];
			if (run) await run(token, scene.shots[0]);
			else console.warn(`No live runner for scene '${scene.id}', skipping.`);
		}
	}
} finally {
	await browser.close();
}
if (failures.length) console.warn(`\n${failures.length} shot(s) failed:\n  - ` + failures.join('\n  - '));
console.log('DONE');
