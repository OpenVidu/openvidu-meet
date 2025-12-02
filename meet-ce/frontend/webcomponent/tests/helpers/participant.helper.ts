import { BrowserContext, chromium, Page } from '@playwright/test';
import { BrowserFakeParticipantOptions } from '../interfaces/fake-participant';
import { ChildProcess, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { joinRoomAs, leaveRoom, prepareForJoiningRoom, sleep, waitForElementInIframe } from './function-helpers';
import { MEET_TESTAPP_URL } from '../config';

// LiveKit credentials
const LIVEKIT_API_KEY = process.env['LIVEKIT_API_KEY'] || 'devkey';
const LIVEKIT_API_SECRET = process.env['LIVEKIT_API_SECRET'] || 'secret';

// Store fake participant processes for cleanup
const fakeParticipantProcesses = new Map<string, ChildProcess>();

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// FAKE PARTICIPANT HELPER FUNCTIONS
// ==========================================

/**
 * Path to the test audio assets directory
 * Uses __dirname to resolve relative to this file's location
 */
const AUDIO_ASSETS_DIR = path.resolve(__dirname, '../assets/audio');

/**
 * Joins a fake participant to a LiveKit room using the lk CLI.
 * This participant can publish audio to trigger speaker detection.
 *
 * @param roomId - The room ID to join
 * @param identity - The participant identity/name
 * @param options - Options for publishing media
 */
export const joinFakeParticipant = async (roomId: string, identity: string): Promise<void> => {
	console.log(`🤖 Joining fake participant: ${identity} to room: ${roomId}`);

	const process = spawn('lk', [
		'room',
		'join',
		roomId,
		'--identity',
		identity,
		'--publish-demo',
		'--api-key',
		LIVEKIT_API_KEY,
		'--api-secret',
		LIVEKIT_API_SECRET
	]);

	// Store process for cleanup
	fakeParticipantProcesses.set(`${roomId}-${identity}`, process);

	// Wait for participant to join
	await sleep(1500);

	console.log(`✅ Fake participant joined: ${identity}`);
};

/**
 * Disconnects a specific fake participant from the room.
 *
 * @param roomId - The room ID
 * @param identity - The participant identity to disconnect
 */
export const disconnectFakeParticipant = async (roomId: string, identity: string): Promise<void> => {
	const key = `${roomId}-${identity}`;
	const process = fakeParticipantProcesses.get(key);

	if (process) {
		process.kill();
		fakeParticipantProcesses.delete(key);
		console.log(`👋 Disconnected fake participant: ${identity}`);
		await sleep(500);
	}
};

/**
 * Disconnects all fake participants from all rooms.
 * Should be called in afterEach or afterAll hooks.
 */
export const disconnectAllFakeParticipants = async (): Promise<void> => {
	for (const [key, process] of fakeParticipantProcesses) {
		process.kill();
	}

	fakeParticipantProcesses.clear();
	await sleep(500);
};

// ==========================================
// BROWSER-BASED FAKE PARTICIPANT HELPERS
// ==========================================
// These functions use Playwright browser tabs with fake audio devices
// to create participants that properly trigger LiveKit's VAD

/**
 * Store for browser-based fake participant contexts
 * Each participant gets its own browser context with specific Chrome args
 */
const browserFakeParticipants = new Map<string, { context: BrowserContext; page: Page }>();

/**
 * Joins a fake participant to a room using a new browser instance with fake audio device.
 * This method properly triggers LiveKit's Voice Activity Detection (VAD) because
 * it uses Chrome's --use-file-for-fake-audio-capture flag.
 *
 * IMPORTANT: The audio file should be in WAV format for best compatibility with Chrome.
 * Chrome's fake audio capture works best with uncompressed audio.
 *
 * @param roomId - The room ID to join
 * @param identity - The participant identity/name
 * @param options - Options for the fake participant
 * @returns The page object for the fake participant (for further interactions)
 *
 * @example
 * ```typescript
 * const participantPage = await joinBrowserFakeParticipant(
 *   browser,
 *   roomId,
 *   'RemoteA-Speaker',
 *   { audioFile: 'continuous_speech.wav' }
 * );
 * ```
 */
export const joinBrowserFakeParticipant = async (
	roomId: string,
	identity: string,
	options: BrowserFakeParticipantOptions = {}
): Promise<Page> => {
	console.log(`🌐 Joining browser-based fake participant: ${identity} to room: ${roomId}`);

	const { audioFile, videoFile, displayName = identity, enableVideo = true, enableAudio = true } = options;

	// Video assets directory (sibling to audio assets)
	const VIDEO_ASSETS_DIR = path.resolve(path.dirname(AUDIO_ASSETS_DIR), 'video');

	// Resolve audio file path
	let audioFilePath: string | undefined;
	if (audioFile) {
		audioFilePath = path.isAbsolute(audioFile) ? audioFile : path.resolve(AUDIO_ASSETS_DIR, audioFile);

		if (!fs.existsSync(audioFilePath)) {
			throw new Error(`Audio file not found: ${audioFilePath}`);
		}
		console.log(`   🎵 Using audio file: ${audioFilePath}`);
	}

	// Resolve video file path
	let videoFilePath: string | undefined;
	if (videoFile) {
		videoFilePath = path.isAbsolute(videoFile) ? videoFile : path.resolve(VIDEO_ASSETS_DIR, videoFile);

		if (!fs.existsSync(videoFilePath)) {
			throw new Error(`Video file not found: ${videoFilePath}`);
		}
		console.log(`   🎬 Using video file: ${videoFilePath}`);
	}

	// Chrome flags for fake media devices
	const chromeArgs = [
		'--use-fake-ui-for-media-stream', // Auto-accept media permissions
		'--use-fake-device-for-media-stream', // Use fake devices
		'--allow-file-access-from-files',
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--disable-dev-shm-usage'
	];

	// Add fake audio capture file if specified
	if (audioFilePath) {
		chromeArgs.push(`--use-file-for-fake-audio-capture=${audioFilePath}`);
	}

	// Add fake video capture file if specified
	// Chrome supports Y4M (YUV4MPEG2) and MJPEG formats for fake video capture
	if (videoFilePath) {
		// chromeArgs.push(`--use-file-for-fake-video-capture=${videoFilePath}`);
	}

	console.log(`   🔧 Chrome args: ${chromeArgs.join(' ')}`);

	// Launch a new browser context with the specific Chrome args
	// We need to use launchPersistentContext to pass Chrome args
	const userDataDir = `/tmp/playwright-fake-participant-${identity}-${Date.now()}`;

	const context = await chromium.launchPersistentContext(userDataDir, {
		headless: true, // Set to false for debugging
		args: chromeArgs,
		ignoreHTTPSErrors: true,
		bypassCSP: true
	});

	// Get the first page or create one
	const page = context.pages()[0] || (await context.newPage());

	// Store for cleanup
	const key = `${roomId}-${identity}`;
	browserFakeParticipants.set(key, { context, page });

	// Handle the lobby/prejoin if present - click join button
	try {
		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		await joinRoomAs('speaker', identity, page);
		await waitForElementInIframe(page, 'ov-session', { state: 'visible' });
		await waitForElementInIframe(page, '.OV_publisher', { state: 'visible', timeout: 10000 });
	} catch (e) {
		console.log(`   ⚠️ No lobby found or already in room for ${identity}: ${e}`);
	}
	return page;
};

/**
 * Disconnects a browser-based fake participant from the room.
 *
 * @param roomId - The room ID
 * @param identity - The participant identity to disconnect
 */
export const disconnectBrowserFakeParticipant = async (roomId: string, identity: string): Promise<void> => {
	const key = `${roomId}-${identity}`;
	const participant = browserFakeParticipants.get(key);

	if (participant) {
		try {
			await leaveRoom(participant.page);
			await participant.page.close();
		} catch (e) {
			/* ignore */
		}
		try {
			await participant.context.close();
		} catch (e) {
			/* ignore */
		}
		browserFakeParticipants.delete(key);
		console.log(`👋 Disconnected browser fake participant: ${identity}`);
	}
};

/**
 * Disconnects all browser-based fake participants.
 * Should be called in afterEach or afterAll hooks.
 */
export const disconnectAllBrowserFakeParticipants = async (): Promise<void> => {
	const keys = Array.from(browserFakeParticipants.keys());
	for (const key of keys) {
		const participant = browserFakeParticipants.get(key);
		if (participant) {
			try {
				await participant.page.close();
			} catch (e) {
				/* ignore */
			}
			try {
				await participant.context.close();
			} catch (e) {
				/* ignore */
			}
		}
	}
	browserFakeParticipants.clear();
	if (keys.length > 0) {
		console.log(`👋 Disconnected all browser fake participants (${keys.length})`);
	}
};

/**
 * Gets the page object for a browser-based fake participant.
 * Useful for interacting with the participant's UI (mute/unmute, etc.)
 *
 * @param roomId - The room ID
 * @param identity - The participant identity
 * @returns The Page object or undefined if not found
 */
export const getBrowserFakeParticipantPage = (roomId: string, identity: string): Page | undefined => {
	const key = `${roomId}-${identity}`;
	return browserFakeParticipants.get(key)?.page;
};
