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
	}
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
const failures = [];
async function capture(page, shot, theme) {
	const rel = `${shot.domain}/${shot.base}-${theme}.png`;
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
			await page.screenshot({ path: `${OUT}/${rel}` });
			console.log(`  ✓ ${rel}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
			return;
		} catch (e) {
			if (attempt < ATTEMPTS) {
				console.warn(`  … retry ${rel} (attempt ${attempt} failed)`);
				await page.waitForTimeout(2000 * attempt); // backoff
				continue;
			}
			failures.push(`${rel} (${shot.path} — waitFor ${shot.waitFor})`);
			console.warn(`  ✗ ${rel}: ${String(e.message || e).split('\n')[0]}`);
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

// ---------- Main ----------
const token = await apiLogin();
for (const domain of new Set(SCENES.flatMap((s) => (s.shots ? s.shots.map((sh) => sh.domain) : [])))) {
	await mkdir(`${OUT}/${domain}`, { recursive: true });
}
for (const d of ['rooms']) await mkdir(`${OUT}/${d}`, { recursive: true }); // dynamic (build) scenes write here
console.log(`Output: ${OUT}  |  ${WIDTH}x${HEIGHT}@${SCALE}x  |  themes: ${THEMES.join(', ')}  |  scenes: ${SCENES.length}`);

const browser = await chromium.launch({ headless: !HEADED });
try {
	const anon = SCENES.filter((s) => s.auth === 'anon');
	const empties = SCENES.filter((s) => s.requiresEmpty);
	const roomScenes = SCENES.filter((s) => (s.rooms || 0) > 0);
	const agnostic = SCENES.filter((s) => s.auth !== 'anon' && !s.requiresEmpty && !((s.rooms || 0) > 0));
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
} finally {
	await browser.close();
}
if (failures.length) console.warn(`\n${failures.length} shot(s) failed:\n  - ` + failures.join('\n  - '));
console.log('DONE');
